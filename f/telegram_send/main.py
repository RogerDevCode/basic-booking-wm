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

import os
import traceback
from typing import TYPE_CHECKING

from ..internal._wmill_adapter import log
from ._telegram_logic import TelegramService
from ._telegram_models import TelegramInputRoot, TelegramSendData

if TYPE_CHECKING:
    from ..internal._result import Result

MODULE = "telegram_send"


def _normalize_text(value: object) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, tuple):
        return " ".join(str(part) for part in value)
    if value is None:
        return ""
    return str(value)


async def _main_async(args: dict[str, object]) -> Result[TelegramSendData]:
    from ..internal._wmill_adapter import get_variable

    mode_value = args.get("mode")
    if mode_value == "send_message":
        raw_chat_id = args.get("chat_id")
        raw_text = args.get("text")
        chat_id = raw_chat_id if isinstance(raw_chat_id, str) else ""
        text = raw_text if isinstance(raw_text, str) else ""
        if not chat_id.strip() or not text.strip():
            log(
                "Skipping telegram_send due to empty chat_id/text",
                mode="send_message",
                has_chat_id=bool(chat_id.strip()),
                has_text=bool(text.strip()),
                module=MODULE,
            )
            return None, TelegramSendData(sent=False, message_id=None, chat_id=chat_id or None, mode="send_message")

    # Extract bot_token if present
    token_arg = args.get("bot_token")
    resolved_token = (
        str(token_arg) if token_arg else get_variable("u/admin/TELEGRAM_BOT_TOKEN") or os.getenv("TELEGRAM_BOT_TOKEN")
    )

    # Create a local copy to modify
    clean_args: dict[str, object] = {k: v for k, v in args.items() if k != "bot_token"}

    # Ensure inline_buttons is not None for validator
    if clean_args.get("inline_buttons") is None:
        clean_args["inline_buttons"] = []

    try:
        input_root = TelegramInputRoot.model_validate(clean_args)
        input_data = input_root.root
    except Exception as e:
        log("Invalid input for telegram_send", error=str(e), module=MODULE)
        return Exception(f"INVALID_INPUT: {e}"), None

    if not resolved_token:
        return Exception("TELEGRAM_BOT_TOKEN_MISSING"), None

    service = TelegramService(str(resolved_token))
    return await service.execute(input_data)


def main(
    mode: str,
    chat_id: str,
    text: object,
    bot_token: str | None = None,
    parse_mode: str | None = None,
    inline_buttons_json: str | None = None,
    message_id: int | None = None,
) -> TelegramSendData | None:
    import asyncio
    import json

    inline_buttons: list[object] = []
    if inline_buttons_json:
        try:
            data = json.loads(inline_buttons_json)
            if isinstance(data, list):
                inline_buttons = cast("list[object]", data)
        except Exception as e:
            from ..internal._wmill_adapter import log

            log("JSON parse error for inline_buttons", error=str(e), data=inline_buttons_json)

    normalized_text = _normalize_text(text)

    args: dict[str, object] = {
        "mode": mode,
        "chat_id": str(chat_id),
        "text": normalized_text,
        "bot_token": bot_token,
        "parse_mode": parse_mode or "Markdown",
        "inline_buttons": inline_buttons,
        "message_id": message_id,
    }

    try:
        err, result = asyncio.run(_main_async(args))
        if err:
            raise err
        # Ensure it returns the data model
        return result
    except Exception as e:
        tb = traceback.format_exc()
        try:
            from ..internal._wmill_adapter import log

            log("CRITICAL_SEND_ERROR", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            print(f"CRITICAL ERROR: {e}\n{tb}")
        raise RuntimeError(f"Send failed: {e}")  # noqa: B904


from typing import cast  # noqa: E402
