# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "httpx>=0.28.1",
#   "pydantic>=2.10.0",
#   "email-validator>=2.2.0",
#   "asyncpg>=0.30.0",
#   "cryptography>=44.0.0",
#   "beartype>=0.19.0",
#   "returns>=0.24.0",
#   "redis>=7.4.0",
#   "typing-extensions>=4.12.0"
# ]
# ///
from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Final, Literal, cast

from .._wmill_adapter import log
from ._ai_agent_logic import (
    adjust_intent_with_context,
    detect_context,
    detect_social,
    determine_escalation_level,
    extract_entities,
    generate_ai_response,
)
from ._ai_agent_models import AIAgentInput, IntentResult, LLMOutput
from ._constants import ESCALATION_THRESHOLDS, INTENT
from ._guardrails import sanitize_json_response, validate_input, verify_urgency
from ._llm_client import call_llm
from ._prompt_builder import build_system_prompt, build_user_message
from ._rag_context import build_rag_context
from ._tfidf_classifier import classify_intent

MODULE: Final[str] = "ai_agent"


async def _main_async(args: dict[str, Any]) -> dict[str, Any]:
    start_ms = int(time.time() * 1000)

    # 0. Validate Input
    try:
        input_data = AIAgentInput.model_validate(args)
    except Exception as e:
        return {"success": False, "data": None, "error_code": "VALIDATION_ERROR", "error_message": str(e)}

    text = input_data.text

    # 1. Guardrails
    guard = validate_input(text)
    if guard["kind"] == "blocked":
        return {"success": False, "data": None, "error_code": "GUARDRAIL_BLOCKED", "error_message": guard["reason"]}

    # 2. Intent Detection
    intent: str = INTENT["DESCONOCIDO"]
    confidence: float = 0.0
    provider: Literal["groq", "openai", "openrouter", "fallback", "fast-path"] = "fallback"
    cot_reasoning = "Fallback to rules-based detection"

    # 2.1 Social Fast-Path
    social = detect_social(text)
    if social:
        intent, confidence = social
        provider = "fast-path"
        cot_reasoning = "Social fast-path matched"
    else:
        # 2.2 TF-IDF
        tfidf = classify_intent(text)
        has_enough = len(text.split()) >= 2
        if tfidf["confidence"] >= ESCALATION_THRESHOLDS["tfidf_minimum"] and has_enough:
            intent = str(tfidf["intent"])
            confidence = float(tfidf["confidence"])
            cot_reasoning = f"TF-IDF semantic match ({intent})"

        # 2.3 LLM Path (if enabled)
        rag_context = None
        if intent in [INTENT["PREGUNTA_GENERAL"], INTENT["DESCONOCIDO"]]:
            if input_data.provider_id:
                rag_res = await build_rag_context(input_data.provider_id, text)
                rag_context = rag_res["context"]

        sys_prompt = build_system_prompt(rag_context)
        user_msg = build_user_message(text)

        err_llm, llm_res = await call_llm(sys_prompt, user_msg)
        if not err_llm and llm_res:
            try:
                cleaned = sanitize_json_response(llm_res.content)
                raw_json = json.loads(cleaned)
                llm_out = LLMOutput.model_validate(raw_json)
                intent = llm_out.intent
                confidence = llm_out.confidence
                provider = llm_res.provider
                cot_reasoning = "LLM classification"
            except Exception as e:
                log("LLM response parse failed", error=str(e), content=llm_res.content)

    # 2.5 Context Adjustment
    adj = adjust_intent_with_context(text, intent, confidence, input_data.conversation_state)
    if adj["adjusted"]:
        intent = str(adj["intent"])
        confidence = cast("float", adj["confidence"])
        cot_reasoning = str(adj["reason"])

    # 3. Entities & Context Logic
    entities = extract_entities(text)
    ctx = detect_context(text, entities)

    ai_resp, needs_more, follow_up = generate_ai_response(intent, entities, ctx, input_data.user_profile)

    esc_level = determine_escalation_level(intent, text, confidence)

    result = IntentResult(
        intent=intent,
        confidence=confidence,
        entities=entities,
        context=ctx,
        subtype=None,
        ai_response=ai_resp,
        needs_more_info=needs_more,
        follow_up=follow_up,
        requires_human=(esc_level != "none"),
        escalation_level=esc_level,
        cot_reasoning=cot_reasoning,
        validation_passed=True,
    )

    verified = verify_urgency(result, text)

    # Log/Trace performance (simplified)
    log(
        "AI Agent execution complete",
        intent=verified.intent,
        confidence=verified.confidence,
        provider=provider,
        latency_ms=int(time.time() * 1000) - start_ms,
    )

    return {"success": True, "data": verified.model_dump(), "error_message": None}


def main(
    chat_id: str, text: str, provider_id: str | None = None, conversation_state: dict[str, Any] | None = None
) -> dict[str, object]:
    import traceback

    from pydantic import BaseModel

    args: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "provider_id": provider_id,
        "conversation_state": conversation_state,
    }

    try:
        result = asyncio.run(_main_async(args))
        if result is None:
            return {}

        if isinstance(result, BaseModel):
            return cast("dict[str, object]", result.model_dump())
        elif isinstance(result, dict):
            return cast("dict[str, object]", result)
        else:
            return {"data": result}

    except Exception as e:
        tb = traceback.format_exc()
        try:
            from .._wmill_adapter import log

            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            print(f"CRITICAL ERROR in {__file__}: {e}\n{tb}")

        raise RuntimeError(f"Execution failed: {e}") from e
