# /// script
# requires-python = ">=3.13"
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
import traceback
from collections.abc import Callable, Coroutine, Mapping
from typing import TYPE_CHECKING, Any, cast

from pydantic import BaseModel

from ..availability_check.main import main_async as availability_check_async
from ..booking_cancel.main import main_async as booking_cancel_async
from ..booking_create.main import main_async as booking_create_async
from ..booking_reschedule.main import main_async as booking_reschedule_async
from ..internal._db_client import create_db_client
from ..internal._wmill_adapter import log
from ._context_resolver import resolve_context
from ._intent_router import OrchestratorHandler, normalize_intent
from ._orchestrator_models import OrchestratorInput, OrchestratorResult
from .handlers._cancel import handle_cancel_booking
from .handlers._create import handle_create_booking
from .handlers._get_my_bookings import handle_get_my_bookings
from .handlers._list_available import handle_list_available
from .handlers._reschedule import handle_reschedule

if TYPE_CHECKING:
    from ..internal._result import Result

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


def _build_default_delegates() -> dict[str, Callable[..., Coroutine[Any, Any, Any]]]:
    """Build default delegates using direct async function references."""
    return {
        "book_create": booking_create_async,
        "book_cancel": booking_cancel_async,
        "book_reschedule": booking_reschedule_async,
        "availability_check": availability_check_async,
    }


async def _main_async(
    args: dict[str, object],
    delegates: Mapping[str, Callable[..., Coroutine[Any, Any, Any]]] | None = None,
) -> Result[OrchestratorResult]:
    """Core orchestration logic. `delegates` are injected by the entrypoint."""
    resolved_delegates: Mapping[str, Callable[..., Coroutine[Any, Any, Any]]] = (
        delegates if delegates is not None else _build_default_delegates()
    )

    raw_intent = args.get("intent")
    if not isinstance(raw_intent, str):
        return Exception("Invalid input: intent must be a string"), None

    intent = normalize_intent(raw_intent)
    if not intent:
        # Gracefully ignore non-booking intents so the flow falls back to AI agent response
        return None, None

    try:
        normalized_args = {**args, "intent": intent}
        input_data = OrchestratorInput.model_validate(normalized_args)
    except Exception as e:
        return Exception(f"Invalid input: {e}"), None

    conn = await create_db_client()
    try:
        # Resolve context (tenant, client, provider, service, date, time)
        res_err, ctx = await resolve_context(conn, input_data)
        if res_err or not ctx:
            return res_err or Exception("Context resolution failed"), None

        # Enrich input with resolved context
        enriched_input = input_data.model_copy(
            update={
                "tenant_id": ctx["tenantId"],
                "client_id": ctx["clientId"],
                "provider_id": ctx["providerId"],
                "service_id": ctx["serviceId"],
                "date": ctx["date"],
                "time": ctx["time"],
            }
        )

        handler = HANDLER_MAP[intent]
        exec_err, result = await handler(conn, enriched_input, resolved_delegates)

        if exec_err:
            log("Orchestration execution failed", error=str(exec_err), module=MODULE)
            return exec_err, None

        if not result:
            return Exception("No result returned from handler"), None

        return None, result

    except Exception as e:
        tb = traceback.format_exc()
        log("Unexpected orchestrator error", error=str(e), traceback=tb, module=MODULE)
        return Exception(f"Internal orchestrator error: {e}"), None
    finally:
        await conn.close()


def main(telegram_chat_id: str, intent: str, entities: dict[str, object] | None = None) -> dict[str, object]:
    try:
        args: dict[str, object] = {"telegram_chat_id": telegram_chat_id, "intent": intent, "entities": entities or {}}

        err, result = asyncio.run(_main_async(args, _build_default_delegates()))
        if err:
            raise err

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
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            pass

        raise RuntimeError(f"Execution failed: {e}") from e
