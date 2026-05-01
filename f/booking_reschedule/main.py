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
# Mission         : Cancel old booking + create new one atomically (reschedule)
# DB Tables Used  : bookings, booking_audit, providers, clients, services
# Concurrency Risk: YES — full transaction with SELECT FOR UPDATE + GIST constraint
# GCal Calls      : NO — gcal_sync handles async sync after reschedule
# Idempotency Key : YES — new booking uses `reschedule-{old_key}-{timestamp}`
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Zod Schemas     : YES — InputSchema validates all inputs
# ============================================================================
from pydantic import ValidationError

from ..internal._db_client import create_db_client
from ..internal._result import Result, with_tenant_context
from ..internal._state_machine import validate_transition
from ..internal._wmill_adapter import log
from ._reschedule_logic import authorize, execute_reschedule_logic
from ._reschedule_models import RescheduleInput, RescheduleResult, RescheduleWriteResult
from ._reschedule_repository import PostgresRescheduleRepository

MODULE = "booking_reschedule"


async def main_async(args: dict[str, object]) -> Result[RescheduleResult]:
    raw_input: object
    if "rawInput" in args:
        raw_input = args["rawInput"]
    else:
        raw_input = args

    try:
        if not isinstance(raw_input, dict):
            raise ValueError("Input must be a JSON object")
        input_data = RescheduleInput.model_validate(raw_input)
    except ValidationError as e:
        log("Validation failed", error=str(e), module=MODULE)
        return Exception(f"Validation error: {e}"), None
    except Exception as e:
        log("Validation failed", error=str(e), module=MODULE)
        return Exception(f"Validation error: {e}"), None

    try:
        conn = await create_db_client()
    except Exception as e:
        return Exception(f"configuration_error: {e}"), None

    try:
        repo = PostgresRescheduleRepository(conn)

        old_booking = await repo.fetch_booking(input_data.booking_id)
        if not old_booking:
            return Exception("Booking not found"), None

        service_id = input_data.new_service_id or old_booking["service_id"]
        service = await repo.fetch_service(service_id)
        if not service:
            return Exception("Service not found"), None

        err_trans, _ = validate_transition(old_booking["status"], "rescheduled")
        if err_trans is not None:
            return err_trans, None

        err_auth, _ = authorize(input_data, old_booking)
        if err_auth is not None:
            return err_auth, None

        async def operation() -> Result[RescheduleWriteResult]:
            return await execute_reschedule_logic(repo, input_data, old_booking, service)

        err, write = await with_tenant_context(conn, old_booking["provider_id"], operation)

        if err is not None or not write:
            log("Reschedule failed", error=str(err), booking_id=input_data.booking_id, module=MODULE)
            msg = str(err) if err else "Transaction error"
            if "duplicate" in msg or "unique" in msg:
                return Exception("Idempotency conflict"), None
            if "overlap" in msg or "exclusion" in msg:
                return Exception("Slot already occupied"), None
            return (err or Exception(msg)), None

        result: RescheduleResult = {
            "old_booking_id": str(write["old_booking_id"]),
            "new_booking_id": str(write["new_booking_id"]),
            "old_status": str(write["old_status"]),
            "new_status": str(write["new_status"]),
            "old_start_time": old_booking["start_time"].isoformat(),
            "new_start_time": str(write["new_start_time"]),
            "new_end_time": str(write["new_end_time"]),
        }

        log(
            "Booking rescheduled successfully",
            old=result["old_booking_id"],
            new=result["new_booking_id"],
            module=MODULE,
        )
        return None, result

    except Exception as e:
        log("Unexpected fatal error", error=str(e), module=MODULE)
        return Exception(str(e)), None
    finally:
        await conn.close()


async def _main_async(args: dict[str, object]) -> Result[RescheduleResult]:
    """Windmill entrypoint."""
    return await main_async(args)


def main(args: RescheduleInput | dict[str, object]) -> dict[str, object]:
    import asyncio
    import traceback
    from typing import cast

    from pydantic import BaseModel

    try:
        if isinstance(args, RescheduleInput):
            validated = args
        else:
            validated = RescheduleInput.model_validate(args)
            
        err, result = asyncio.run(_main_async(validated.model_dump()))
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
            from ..internal._wmill_adapter import log
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            pass
        raise RuntimeError(f"Execution failed: {e}") from e
