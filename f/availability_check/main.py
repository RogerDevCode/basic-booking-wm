import asyncio
import wmill
# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Get available time slots for a provider on a given date
# DB Tables Used  : providers, provider_schedules, schedule_overrides, bookings, services
# Concurrency Risk: NO — read-only queries
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates all inputs
# ============================================================================

from typing import Any
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import with_tenant_context, Result
from ..internal.scheduling_engine import get_availability
from ._availability_models import InputSchema, AvailabilityResult
from ._availability_logic import get_provider, get_provider_service_id

MODULE = "availability_check"

async def main_async(args: dict[str, Any]) -> Result[AvailabilityResult]:
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return Exception(f"Validation error: {e}"), None

    conn = await create_db_client()
    try:
        async def operation() -> Result[AvailabilityResult]:
            provider = await get_provider(conn, input_data.provider_id)
            if not provider:
                return Exception(f"Provider {input_data.provider_id} not found or inactive"), None

            effective_service_id = input_data.service_id or await get_provider_service_id(conn, input_data.provider_id)
            if not effective_service_id:
                return Exception("No services available for this provider"), None

            sched_err, sched_result = await get_availability(conn, {
                "provider_id": input_data.provider_id,
                "date": input_data.date,
                "service_id": effective_service_id,
            })

            if sched_err:
                return sched_err, None

            if not sched_result:
                return Exception("No availability data returned"), None

            return None, {
                "provider_id": input_data.provider_id,
                "provider_name": provider["name"],
                "date": sched_result["date"],
                "timezone": provider["timezone"],
                "slots": sched_result["slots"],
                "total_available": sched_result["total_available"],
                "total_booked": sched_result["total_booked"],
                "is_blocked": sched_result["is_blocked"],
                "block_reason": sched_result["block_reason"],
            }

        return await with_tenant_context(conn, input_data.tenant_id, operation)

    except Exception as e:
        log("Unexpected error in availability_check", error=str(e), module=MODULE)
        return Exception(f"Internal error: {e}"), None
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]


def main(args: dict):
    import traceback
    try:
        return asyncio.run(main_async(args))
    except Exception as e:
        tb = traceback.format_exc()
        # Intentamos usar el adaptador local si está disponible, si no print
        try:
            from ..internal._wmill_adapter import log
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module="availability_check")
        except:
            print(f"CRITICAL ERROR in availability_check: {e}\n{tb}")
        
        # Elevamos para que Windmill marque como FAILED
        raise RuntimeError(f"Execution failed: {e}")
