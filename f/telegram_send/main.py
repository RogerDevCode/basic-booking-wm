import asyncio
import os
import traceback
from typing import Any, Optional, List
from ..internal._wmill_adapter import log
from ..internal._result import Result
from ._telegram_models import TelegramSendData, TelegramInputRoot
from ._telegram_logic import TelegramService

MODULE = "telegram_send"

async def _main_async(args: dict[str, Any]) -> Result[TelegramSendData]:
    from ..internal._wmill_adapter import get_variable
    resolved_token = args.pop("bot_token", None) or get_variable("u/admin/TELEGRAM_BOT_TOKEN") or os.getenv("TELEGRAM_BOT_TOKEN")
    
    # Asegurar que inline_buttons no sea None para el validador
    if args.get("inline_buttons") is None:
        args["inline_buttons"] = []

    try:
        input_root = TelegramInputRoot.model_validate(args)
        input_data = input_root.root
    except Exception as e:
        log("Invalid input for telegram_send", error=str(e), args=args, module=MODULE)
        return Exception(f"INVALID_INPUT: {e}"), None

    if not resolved_token:
        return Exception("TELEGRAM_BOT_TOKEN_MISSING"), None

    service = TelegramService(str(resolved_token))
    return await service.execute(input_data)

def main(mode: str, chat_id: str, text: str, bot_token: Optional[str] = None, 
         parse_mode: Optional[str] = None, inline_buttons_json: Optional[str] = None, 
         message_id: Optional[int] = None) -> Any:
    
    import json
    inline_buttons = []
    if inline_buttons_json:
        try:
            inline_buttons = json.loads(inline_buttons_json)
        except Exception as e:
            from ..internal._wmill_adapter import log
            log("JSON parse error for inline_buttons", error=str(e), data=inline_buttons_json)
            inline_buttons = []
            
    args = {
        "mode": mode,
        "chat_id": str(chat_id),
        "text": text,
        "bot_token": bot_token,
        "parse_mode": parse_mode or "Markdown",
        "inline_buttons": inline_buttons,
        "message_id": message_id
    }
    import traceback
    try:
        return asyncio.run(_main_async(args))
    except Exception as e:
        tb = traceback.format_exc()
        try:
            from ..internal._wmill_adapter import log
            log("CRITICAL_SEND_ERROR", error=str(e), traceback=tb, module=MODULE)
        except:
            print(f"CRITICAL ERROR: {e}\n{tb}")
        raise RuntimeError(f"Send failed: {e}")
