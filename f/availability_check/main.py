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

from typing import Any, cast

from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, with_tenant_context
from ..internal._wmill_adapter import log
from ..internal.scheduling_engine import get_availability
from ._availability_logic import get_provider, get_provider_service_id
from ._availability_models import AvailabilityResult, InputSchema

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

MODULE = "availability_check"


async def main_async(args: dict[str, Any]) -> Result[AvailabilityResult]:
    """
    Business logic entrypoint.
    """
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return Exception(f"Validation error: {e}"), None

    conn = await create_db_client()
    try:

        async def operation() -> Result[AvailabilityResult]:
            # 1. Resolve Provider
            provider = await get_provider(conn, input_data.provider_id)
            if not provider:
                return Exception(f"Provider {input_data.provider_id} not found or inactive"), None

            # 2. Resolve Service
            effective_service_id = input_data.service_id or await get_provider_service_id(conn, input_data.provider_id)
            if not effective_service_id:
                return Exception("No services available for this provider"), None

            # 3. Fetch Availability from engine
            sched_err, sched_result = await get_availability(
                conn,
                {
                    "provider_id": input_data.provider_id,
                    "date": input_data.date,
                    "service_id": effective_service_id,
                },
            )

            if sched_err:
                return sched_err, None

            if not sched_result:
                return Exception("No availability data returned from engine"), None

            # 4. Map Result
            res: AvailabilityResult = {
                "provider_id": input_data.provider_id,
                "provider_name": str(provider["name"]),
                "date": str(sched_result["date"]),
                "timezone": str(provider["timezone"]),
                "slots": list(sched_result["slots"]),
                "total_available": int(sched_result["total_available"]),
                "total_booked": int(sched_result["total_booked"]),
                "is_blocked": bool(sched_result["is_blocked"]),
                "block_reason": str(sched_result["block_reason"]) if sched_result["block_reason"] else None,
            }
            return ok(res)

        return await with_tenant_context(conn, input_data.tenant_id, operation)

    except Exception as e:
        log("Unexpected error in availability_check", error=str(e), module=MODULE)
        return Exception(f"Internal error: {e}"), None
    finally:
        await conn.close()


def main(args: InputSchema | dict[str, Any]) -> dict[str, Any]:
    """
    Windmill sync wrapper.
    """
    import asyncio
    import traceback

    try:
        if isinstance(args, InputSchema):
            validated = args
        else:
            validated = InputSchema.model_validate(args)

        err, result = asyncio.run(main_async(validated.model_dump()))
        if err:
            raise err

        if result is None:
            return {}

        return cast("dict[str, Any]", result)

    except Exception as e:
        tb = traceback.format_exc()
        try:
            from ..internal._wmill_adapter import log

            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            pass
        raise RuntimeError(f"Execution failed: {e}") from e
