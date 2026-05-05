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

from pydantic import ValidationError

from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, ok, with_tenant_context
from ..internal._state_machine import validate_transition
from ..internal._wmill_adapter import log
from ._reschedule_logic import authorize, execute_reschedule_logic
from ._reschedule_models import RescheduleInput, RescheduleResult, RescheduleWriteResult
from ._reschedule_repository import PostgresRescheduleRepository

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

MODULE = "booking_reschedule"


async def main_async(args: dict[str, Any]) -> Result[RescheduleResult]:
    """
    Orchestrator for the rescheduling process.
    """
    # 1. Input Sanitization
    try:
        raw_input = args.get("rawInput", args)
        if not isinstance(raw_input, dict):
            return fail("invalid_input: expected_dictionary")
        input_data = RescheduleInput.model_validate(raw_input)
    except ValidationError as e:
        return fail(f"validation_failed: {e}")
    except Exception as e:
        return fail(f"unexpected_input_error: {e}")

    conn = await create_db_client()
    try:
        repo = PostgresRescheduleRepository(conn)

        # 2. Initial Data Retrieval
        try:
            old_booking = await repo.fetch_booking(input_data.booking_id)
            if not old_booking:
                return fail(f"booking_not_found: {input_data.booking_id}")
        except Exception as e:
            return fail(f"db_lookup_booking_failed: {e}")

        try:
            service_id = input_data.new_service_id or old_booking["service_id"]
            service = await repo.fetch_service(service_id)
            if not service:
                return fail(f"service_not_found: {service_id}")
        except Exception as e:
            return fail(f"db_lookup_service_failed: {e}")

        # 3. Validation & Authorization
        try:
            err_trans, _ = validate_transition(old_booking["status"], "rescheduled")
            if err_trans:
                return fail(err_trans)
        except Exception as e:
            return fail(f"state_validation_failed: {e}")

        err_auth, _ = authorize(input_data, old_booking)
        if err_auth:
            return fail(err_auth)

        # 4. Transactional Execution
        async def operation() -> Result[RescheduleWriteResult]:
            try:
                return await execute_reschedule_logic(repo, input_data, old_booking, service)
            except Exception as e_op:
                return fail(f"reschedule_op_failed: {e_op}")

        tenant_id = str(old_booking["provider_id"])
        err, write = await with_tenant_context(conn, tenant_id, operation)

        if err or not write:
            # Handle specific known DB errors to provide friendly messages
            msg = str(err) if err else "transaction_empty"
            if "duplicate" in msg or "unique" in msg:
                return fail("idempotency_conflict")
            if "overlap" in msg or "exclusion" in msg or "already_booked" in msg:
                return fail("time_slot_occupied")
            return fail(err or "reschedule_failed")

        # 5. Success Result Mapping
        try:
            result: RescheduleResult = {
                "old_booking_id": str(write["old_booking_id"]),
                "new_booking_id": str(write["new_booking_id"]),
                "old_status": str(write["old_status"]),
                "new_status": str(write["new_status"]),
                "old_start_time": old_booking["start_time"].isoformat(),
                "new_start_time": str(write["new_start_time"]),
                "new_end_time": str(write["new_end_time"]),
            }
            return ok(result)
        except KeyError as e_key:
            return fail(f"result_mapping_failed: missing_{e_key}")

    except Exception as e:
        log("CRITICAL_RESCHEDULE_ERROR", error=str(e), module=MODULE)
        return fail(f"unhandled_reschedule_error: {e}")
    finally:
        await conn.close()


def main(args: RescheduleInput | dict[str, Any]) -> dict[str, Any]:
    """
    Windmill sync wrapper.
    """
    import asyncio
    import traceback

    try:
        if isinstance(args, RescheduleInput):
            validated = args
        else:
            validated = RescheduleInput.model_validate(args)

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

            log("ENTRYPOINT_CATASTROPHE", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            pass
        raise RuntimeError(f"Execution failed: {e}") from e
