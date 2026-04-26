# mypy: disable-error-code="misc"
"""Telegram API integration logic - handles untyped API responses."""
from typing import Any
import httpx
import asyncio
import json
from typing import Optional, List, Dict, Tuple, cast
from ..internal._result import Result, ok, fail
from ..internal._config import MAX_RETRIES, TIMEOUT_TELEGRAM_API_MS
from ._telegram_models import TelegramInput, TelegramSendData, TelegramResponse, InlineButton

class TelegramService:
    def __init__(self, bot_token: str) -> None:
        self.bot_token = bot_token
        self.base_url = f"https://api.telegram.org/bot{bot_token}"

    async def execute(self, input_data: TelegramInput) -> Result[TelegramSendData]:
        endpoint, body = self.prepare_request(input_data)
        
        last_err = None
        for attempt in range(MAX_RETRIES):
            try:
                res_data = await self.api_call(endpoint, body)
                msg_id = res_data.result.message_id if res_data.result else None
                chat_id = getattr(input_data, "chat_id", None)
                
                return ok(TelegramSendData(
                    sent=True,
                    message_id=msg_id,
                    mode=input_data.mode,
                    chat_id=chat_id
                ))
            except Exception as e:
                last_err = e
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(0.5 * (2 ** attempt))
        
        return fail(last_err or "Telegram API failed")

    def prepare_request(self, input_data: TelegramInput) -> Tuple[str, Dict[str, Any]]:
        mode = input_data.mode
        
        if mode == 'send_message':
            inp = cast(Any, input_data)
            keyboard = self.normalize_keyboard(inp.inline_buttons)
            return f"{self.base_url}/sendMessage", {
                "chat_id": inp.chat_id,
                "text": inp.text,
                "parse_mode": inp.parse_mode,
                "reply_markup": {"inline_keyboard": keyboard} if keyboard else None
            }
        
        elif mode == 'edit_message':
            inp = cast(Any, input_data)
            keyboard = self.normalize_keyboard(inp.inline_buttons)
            return f"{self.base_url}/editMessageText", {
                "chat_id": inp.chat_id,
                "message_id": inp.message_id,
                "text": inp.text,
                "parse_mode": inp.parse_mode,
                "reply_markup": {"inline_keyboard": keyboard} if keyboard else None
            }
            
        elif mode == 'delete_message':
            inp = cast(Any, input_data)
            return f"{self.base_url}/deleteMessage", {
                "chat_id": inp.chat_id,
                "message_id": inp.message_id
            }
            
        elif mode == 'answer_callback':
            inp = cast(Any, input_data)
            body = {"callback_query_id": inp.callback_query_id}
            if inp.callback_alert:
                body["text"] = inp.callback_alert
                body["show_alert"] = True
            return f"{self.base_url}/answerCallbackQuery", body

        raise ValueError(f"Unsupported mode: {mode}")

    async def api_call(self, url: str, body: Dict[str, Any]) -> TelegramResponse:
        # Use json parameter in post which automatically sets headers and handles nested dicts
        async with httpx.AsyncClient(timeout=TIMEOUT_TELEGRAM_API_MS / 1000.0) as client:
            clean_body = {k: v for k, v in body.items() if v is not None}
            response = await client.post(url, json=clean_body)

            data = response.json()
            parsed = TelegramResponse.model_validate(data)
            
            if not parsed.ok:
                desc = parsed.description or "Unknown error"
                code = parsed.error_code or 0
                raise Exception(f"TELEGRAM_ERROR_{code}: {desc}")
                
            return parsed

    def normalize_keyboard(self, buttons: Any) -> List[List[Dict[str, str]]]:
        if not buttons:
            return []
        
        # Caso 1: Ya es una lista de listas (el formato que genera MenuController)
        if isinstance(buttons, list) and len(buttons) > 0 and isinstance(buttons[0], list):
            return buttons
            
        # Caso 2: Es una lista plana de objetos InlineButton o dicts
        normalized: List[List[Dict[str, str]]] = []
        flat_list = list(buttons)
        for i in range(0, len(flat_list), 2):
            row = []
            for b in flat_list[i:i+2]:
                if hasattr(b, "text"): # Es un objeto InlineButton
                    row.append({"text": b.text, "callback_data": b.callback_data})
                elif isinstance(b, dict):
                    row.append({"text": b.get("text", ""), "callback_data": b.get("callback_data", "")})
            normalized.append(row)
        return normalized
