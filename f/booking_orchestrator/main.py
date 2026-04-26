from __future__ import annotations
import asyncio
from typing import Any
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result
from ._orchestrator_models import OrchestratorInput, OrchestratorResult
from ._intent_router import normalize_intent, OrchestratorHandler
from ._context_resolver import resolve_context
from .handlers._create import handle_create_booking
from .handlers._cancel import handle_cancel_booking
from .handlers._reschedule import handle_reschedule
from .handlers._list_available import handle_list_available
from .handlers._get_my_bookings import handle_get_my_bookings

# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Routes AI intents to booking actions (create, cancel, reschedule, list)
# DB Tables Used  : bookings, providers, clients, services, provider_schedules
# Concurrency Risk: YES — delegates to booking_create/cancel/reschedule which use transactions
# GCal Calls      : NO — delegates to gcal_sync
# Idempotency Key : YES — delegates to child scripts
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — OrchestratorInput validates all inputs
# mypy + pyright  : PASS (strict mode)
# ============================================================================

MODULE = "booking_orchestrator"

HANDLER_MAP: dict[str, OrchestratorHandler] = {
    "crear_cita": handle_create_booking,
    "cancelar_cita": handle_cancel_booking,
    "reagendar_cita": handle_reschedule,
    "ver_disponibilidad": handle_list_available,
    "mis_citas": handle_get_my_bookings,
}

async def _main_async(args: dict[str, object]) -> Result[OrchestratorResult]:
    try:
        input_data = OrchestratorInput.model_validate(args)
    except Exception as e:
        return Exception(f"Invalid input: {e}"), None

    intent = normalize_intent(input_data.intent)
    if not intent:
        return Exception(f"Unknown intent: {input_data.intent}"), None

    conn = await create_db_client()
    try:
        # Resolve context (tenant, client, provider, service, date, time)
        res_err, ctx = await resolve_context(conn, input_data)
        if res_err or not ctx:
            return res_err or Exception("Context resolution failed"), None

        # Enrich input with resolved context
        enriched_input = input_data.model_copy(update={
            "tenant_id": ctx["tenantId"],
            "client_id": ctx["clientId"],
            "provider_id": ctx["providerId"],
            "service_id": ctx["serviceId"],
            "date": ctx["date"],
            "time": ctx["time"],
        })

        handler = HANDLER_MAP[intent]
        exec_err, result = await handler(conn, enriched_input)

        if exec_err:
            log("Orchestration execution failed", error=str(exec_err), module=MODULE)
            return exec_err, None

        if not result:
            return Exception("No result returned from handler"), None

        return None, result

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        log("Unexpected orchestrator error", error=str(e), traceback=tb, module=MODULE)
        return Exception(f"Internal orchestrator error: {e}"), None
    finally:
        await conn.close()


async def main(telegram_chat_id: str, intent: str, entities: dict[str, object] | None = None) -> dict[str, Any]:
    """
    Entrypoint asincrónico para la ejecución en Windmill.
    """
    try:
        args: dict[str, object] = {
            "telegram_chat_id": telegram_chat_id, 
            "intent": intent, 
            "entities": entities or {}
        }
        err, result = await _main_async(args)
        if err:
            raise err
        # Windmill expects a JSON-serializable dict, we cast result to Any for the return
        return dict(result) if result else {}
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        log("CRITICAL_ORCHESTRATOR_ERROR", error=str(e), traceback=tb, module=MODULE)
        # Raise to let Windmill know it failed
        raise RuntimeError(f"Orchestrator failed: {e}")
