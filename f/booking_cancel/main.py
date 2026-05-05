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
from ..internal._wmill_adapter import log
from ._booking_cancel_models import CancelBookingInput, CancelResult, UpdatedBooking
from ._booking_cancel_repository import PostgresBookingCancelRepository
from ._cancel_booking_logic import authorize_actor, execute_cancel_booking

# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Cancel an existing medical appointment
# DB Tables Used  : bookings, booking_audit
# Concurrency Risk: YES — SELECT FOR UPDATE on booking row inside transaction
# GCal Calls      : NO — gcal_sync handles async sync after cancel
# Idempotency Key : YES — checks existing cancelled status before mutation
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Zod Schemas     : YES — InputSchema validates all inputs
# ============================================================================

MODULE = "booking_cancel"


async def main_async(args: dict[str, Any]) -> Result[CancelResult]:
    """
    Main business logic orchestrator for cancellations.
    """
    # 1. Input Sanitization
    try:
        raw_input = args.get("rawInput", args)
        if not isinstance(raw_input, dict):
            return fail("invalid_input: expected_dictionary")
        input_data = CancelBookingInput.model_validate(raw_input)
    except ValidationError as e:
        return fail(f"validation_failed: {e}")
    except Exception as e:
        return fail(f"unexpected_input_error: {e}")

    conn = await create_db_client()
    try:
        repo = PostgresBookingCancelRepository(conn)

        # 2. Initial Lookup & Authorization (Outside tenant context for lookup)
        try:
            booking = await repo.fetch_booking(input_data.booking_id)
            if not booking:
                return fail(f"booking_not_found: {input_data.booking_id}")
        except Exception as e:
            return fail(f"db_lookup_failed: {e}")

        # 3. Authorization check
        err_auth, _ = authorize_actor(input_data, booking)
        if err_auth:
            return fail(err_auth)

        # 4. Transactional Execution with Tenant Isolation
        async def operation() -> Result[UpdatedBooking]:
            try:
                return await execute_cancel_booking(repo, input_data, booking)
            except Exception as e_op:
                return fail(f"cancellation_op_failed: {e_op}")

        tenant_id = str(booking["provider_id"])
        err, updated = await with_tenant_context(conn, tenant_id, operation)

        if err or not updated:
            return fail(err or "cancellation_result_empty")

        # 5. Result Mapping
        try:
            result: CancelResult = {
                "booking_id": str(updated["booking_id"]),
                "previous_status": str(booking["status"]),
                "new_status": str(updated["status"]),
                "cancelled_by": str(updated["cancelled_by"]),
                "cancellation_reason": updated.get("cancellation_reason"),
            }
            return ok(result)
        except KeyError as e_key:
            return fail(f"result_mapping_failed: missing_{e_key}")

    except Exception as e:
        log("CRITICAL_CANCEL_ERROR", error=str(e), module=MODULE)
        return fail(f"unhandled_cancellation_error: {e}")
    finally:
        await conn.close()


def main(args: CancelBookingInput | dict[str, Any]) -> dict[str, Any]:
    """
    Windmill sync wrapper.
    """
    import asyncio
    import traceback

    try:
        if isinstance(args, CancelBookingInput):
            validated = args
        else:
            validated = CancelBookingInput.model_validate(args)

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
