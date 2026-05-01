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
from typing import TYPE_CHECKING

from ..internal._wmill_adapter import get_variable
from ._callback_logic import answer_callback_query, parse_callback_data, send_followup_message
from ._callback_models import ActionContext, InputSchema
from ._callback_router import AcknowledgeHandler, CancelHandler, ConfirmHandler, TelegramRouter

if TYPE_CHECKING:
    from ..internal._result import Result

MODULE = "telegram_callback"


async def _main_async(args: dict[str, object]) -> Result[dict[str, object]]:
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
    router.register("confirm", ConfirmHandler())
    router.register("cancel", CancelHandler())
    router.register("acknowledge", AcknowledgeHandler())

    context: ActionContext = {
        "botToken": bot_token,
        "tenantId": tenant_id,
        "booking_id": booking_id,
        "client_id": input_data.client_id,
        "chat_id": input_data.chat_id,
        "callback_query_id": input_data.callback_query_id,
    }

    err_route, result = await router.route(action, context)
    if err_route or not result:
        return err_route or Exception("Route failed"), None

    # 6. Response to Telegram
    await answer_callback_query(bot_token, input_data.callback_query_id, result["responseText"])

    if result.get("followUpText"):
        await send_followup_message(bot_token, input_data.chat_id, str(result["followUpText"]))

    res: dict[str, object] = {
        "action": action,
        "booking_id": booking_id,
        "callback_query_id": input_data.callback_query_id,
        "response_text": result["responseText"],
    }
    return None, res


def main(args: InputSchema | dict[str, object]) -> dict[str, object]:
    import asyncio
    import traceback
    from typing import cast

    from pydantic import BaseModel

    try:
        if isinstance(args, InputSchema):
            validated = args
        else:
            validated = InputSchema.model_validate(args)
            
        err, result = asyncio.run(_main_async(validated.model_dump()))
        if err:
            raise err
            
        if result is None:
            return {}
        
        if isinstance(result, BaseModel):
            return cast("dict[str, object]", result.model_dump())
        elif isinstance(result, dict):
            return result
        else:
            return {"data": result}
            
    except Exception as e:
        tb = traceback.format_exc()
        try:
            from ..internal._wmill_adapter import log
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            pass
        raise RuntimeError(f"Execution failed: {e}") from e
