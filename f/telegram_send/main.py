# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Send/edit/delete Telegram messages + answer callback queries
# DB Tables Used  : NONE
# Concurrency Risk: NO
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : NO
# Pydantic Schemas: YES — discriminated union validates all modes
# ============================================================================

from typing import Any
from ..internal._wmill_adapter import log, get_variable
from ..internal._result import Result
from ._telegram_models import TelegramInput, TelegramSendData, TelegramResponse, TelegramInputRoot
from ._telegram_logic import TelegramService

MODULE = "telegram_send"

async def main(args: dict[str, Any]) -> Result[TelegramSendData]:
    # 1. Standardize and Validate Input
    try:
        # Pydantic's discriminator handling via RootModel
        input_root = TelegramInputRoot.model_validate(args)
        input_data = input_root.root
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        log("Invalid input for telegram_send", error=str(e), traceback=tb, args=args, module=MODULE)
        return Exception(f"INVALID_INPUT: {e}"), None

    # 2. Resolve Dependencies
    bot_token = get_variable("TELEGRAM_BOT_TOKEN")
    if not bot_token:
        return Exception("TELEGRAM_BOT_TOKEN_MISSING"), None

    # 3. Execute Mission
    service = TelegramService(bot_token)
    err, result = await service.execute(input_data)
    
    if err:
        log("Telegram Service Error", error=str(err), module=MODULE)
        return err, None
        
    return None, result
