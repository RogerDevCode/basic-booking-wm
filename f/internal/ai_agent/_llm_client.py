import httpx
import json
import time
import asyncio
from typing import List, Dict, Any, Optional, Tuple, Literal, cast, TypedDict
from pydantic import BaseModel, ConfigDict
from ._constants import INTENT
from ._ai_agent_models import LLMOutput
from .._wmill_adapter import get_variable, log

# ============================================================================
# LLM CLIENT — Configurable Provider Chain (v6.0)
# ============================================================================

class ChatMessage(TypedDict):
    role: Literal['system', 'user', 'assistant']
    content: str

class LLMResponse(BaseModel):
    content: str
    provider: Literal['groq', 'openai', 'openrouter']
    tokens_in: int
    tokens_out: int
    latency_ms: int
    cached: bool = False

async def call_llm(
    system_prompt: str,
    user_message: str
) -> Tuple[Optional[Exception], Optional[LLMResponse]]:
    # ─── Configuration ──────────────
    order_str = get_variable("LLM_PROVIDER_ORDER") or "openai,groq,openrouter"
    provider_order = [s.strip().lower() for s in order_str.split(',')]

    providers = {
        'groq': {
            'name': 'groq',
            'url': 'https://api.groq.com/openai/v1/chat/completions',
            'key': get_variable("GROQ_API_KEY"),
            'model': get_variable("GROQ_MODEL") or "llama-3.3-70b-versatile",
            'structured': False
        },
        'openai': {
            'name': 'openai',
            'url': 'https://api.openai.com/v1/chat/completions',
            'key': get_variable("OPENAI_API_KEY"),
            'model': get_variable("OPENAI_MODEL") or "gpt-4o-mini",
            'structured': True
        },
        'openrouter': {
            'name': 'openrouter',
            'url': 'https://openrouter.ai/api/v1/chat/completions',
            'key': get_variable("OPENROUTER_API_KEY"),
            'model': get_variable("OPENROUTER_MODEL") or "openrouter/auto:free",
            'structured': False
        }
    }

    messages: List[ChatMessage] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message}
    ]

    for p_key in provider_order:
        p = providers.get(p_key)
        if not p or not p['key']: continue

        start_time = time.time()
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                headers = {
                    "Authorization": f"Bearer {p['key']}",
                    "Content-Type": "application/json"
                }
                
                # Attributions for OpenRouter
                if p['name'] == 'openrouter':
                    headers["HTTP-Referer"] = "https://localhost"
                    headers["X-Title"] = "Windmill Medical Booking"

                body: Dict[str, Any] = {
                    "model": p['model'],
                    "messages": messages,
                    "temperature": 0.0,
                    "max_tokens": 512
                }

                # Structured Output for OpenAI
                if p['structured']:
                    body["response_format"] = {"type": "json_object"} # Simplified for common use

                response = await client.post(p['url'], headers=headers, json=body)
                
                if response.status_code != 200:
                    log(f"LLM Provider {p_key} failed", status=response.status_code, body=response.text)
                    continue

                data = response.json()
                content = data["choices"][0]["message"]["content"]
                usage = data.get("usage", {})

                return None, LLMResponse(
                    content=content,
                    provider=cast(Any, p['name']),
                    tokens_in=usage.get("prompt_tokens", 0),
                    tokens_out=usage.get("completion_tokens", 0),
                    latency_ms=int((time.time() - start_time) * 1000)
                )

        except Exception as e:
            log(f"LLM call to {p_key} exception", error=str(e))
            continue

    return Exception("All LLM providers failed"), None
