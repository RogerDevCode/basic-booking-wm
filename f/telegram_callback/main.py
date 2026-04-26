import asyncio
# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Handle Telegram inline keyboard button actions
# DB Tables Used  : bookings, booking_audit, clients
# Concurrency Risk: YES — booking state transitions
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates callback_data format
# ============================================================================

from typing import Any, Dict, Optional
from ..internal._wmill_adapter import log, get_variable
from ..internal._result import Result
from ._callback_models import InputSchema, ActionContext
from ._callback_logic import parse_callback_data, answer_callback_query, send_followup_message
from ._callback_router import TelegramRouter, ConfirmHandler, CancelHandler, AcknowledgeHandler

MODULE = "telegram_callback"

async def _main_async(args: dict[str, Any]) -> Result[Dict[str, Any]]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return Exception(f"Invalid input: {e}"), None

    # 2. Resolve bot token
    bot_token = get_variable("TELEGRAM_BOT_TOKEN")
    if not bot_token:
        return Exception("TELEGRAM_BOT_TOKEN not configured"), None

    # 3. Parse callback data
    parsed_cb = parse_callback_data(input_data.callback_data)
    if not parsed_cb:
        await answer_callback_query(bot_token, input_data.callback_query_id, "⚠️ Acción no reconocida")
        return Exception(f"Invalid callback data format: {input_data.callback_data}"), None

    action = parsed_cb["action"]
    booking_id = parsed_cb["booking_id"]

    # 4. Resolve tenant (client_id or user_id)
    tenant_id = input_data.client_id or input_data.user_id
    if not tenant_id:
        await answer_callback_query(bot_token, input_data.callback_query_id, "⚠️ Error de identificación")
        return Exception("tenant_id could not be determined"), None

    # 5. Route and execute action
    router = TelegramRouter()
    router.register('confirm', ConfirmHandler())
    router.register('cancel', CancelHandler())
    router.register('acknowledge', AcknowledgeHandler())
    # Note: Reschedule and Reminders handlers omitted for brevity/phase scope 
    # but would be registered here

    context: ActionContext = {
        "botToken": bot_token,
        "tenantId": tenant_id,
        "booking_id": booking_id,
        "client_id": input_data.client_id,
        "chat_id": input_data.chat_id,
        "callback_query_id": input_data.callback_query_id
    }

    err_route, result = await router.route(action, context)
    if err_route or not result:
        return err_route or Exception("Route failed"), None

    # 6. Response to Telegram
    await answer_callback_query(bot_token, input_data.callback_query_id, result["responseText"])

    if result["followUpText"]:
        await send_followup_message(bot_token, input_data.chat_id, result["followUpText"])

    return None, {
        "action": action,
        "booking_id": booking_id,
        "callback_query_id": input_data.callback_query_id,
        "response_text": result["responseText"]
    }


def main(args: dict) -> None:
    import traceback
    try:
        return asyncio.run(_main_async(args))
    except Exception as e:
        tb = traceback.format_exc()
        # Intentamos usar el adaptador local si está disponible, si no print
        try:
            from ..internal._wmill_adapter import log
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=os.path.basename(os.path.dirname(__file__)))
        except:
            from ..internal._wmill_adapter import log
            log("BARE_EXCEPT_CAUGHT", file="main.py")
            print(f"CRITICAL ERROR in {__file__}: {e}\n{tb}")
        
        # Elevamos para que Windmill marque como FAILED
        raise RuntimeError(f"Execution failed: {e}")
