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


async def _main_async(args: dict[str, object]) -> Result[TelegramSendData]:
    from ..internal._wmill_adapter import get_variable

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


async def main(
    mode: str,
    chat_id: str,
    text: str,
    bot_token: str | None = None,
    parse_mode: str | None = None,
    inline_buttons_json: str | None = None,
    message_id: int | None = None,
) -> TelegramSendData | None:

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

    args: dict[str, object] = {
        "mode": mode,
        "chat_id": str(chat_id),
        "text": text,
        "bot_token": bot_token,
        "parse_mode": parse_mode or "Markdown",
        "inline_buttons": inline_buttons,
        "message_id": message_id,
    }

    try:
        err, result = await _main_async(args)
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
