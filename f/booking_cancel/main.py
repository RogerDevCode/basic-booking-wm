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

from typing import cast

from pydantic import ValidationError

from ..internal._db_client import create_db_client
from ..internal._result import Result, with_tenant_context
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


async def main_async(args: dict[str, object]) -> Result[CancelResult]:
    raw_input: object
    if "rawInput" in args:
        raw_input = args["rawInput"]
    else:
        raw_input = args

    try:
        if not isinstance(raw_input, dict):
            raise ValueError("Input must be a JSON object")
        input_data = CancelBookingInput.model_validate(raw_input)
    except ValidationError as e:
        log("validation_failed", error=str(e), module=MODULE)
        return Exception(f"validation_error: {e}"), None
    except Exception as e:
        log("validation_failed", error=str(e), module=MODULE)
        return Exception(f"validation_error: {e}"), None

    try:
        conn = await create_db_client()
    except Exception as e:
        return Exception(f"configuration_error: {e}"), None

    try:
        repo = PostgresBookingCancelRepository(conn)

        # Initial Lookup
        booking = await repo.fetch_booking(input_data.booking_id)
        if not booking:
            return Exception(f"booking_not_found: {input_data.booking_id}"), None

        err_auth, _ = authorize_actor(input_data, booking)
        if err_auth is not None:
            return err_auth, None

        async def operation() -> Result[UpdatedBooking]:
            return await execute_cancel_booking(repo, input_data, booking)

        # Cast booking to dict[str, object] to avoid Any contamination
        b_dict = cast("dict[str, object]", booking)
        tenant_id = str(b_dict["provider_id"])

        err, updated = await with_tenant_context(conn, tenant_id, operation)

        if err is not None:
            log("transaction_failed", error=str(err), module=MODULE)
            return err, None

        if not updated:
            return Exception("cancel_failed: no result returned"), None

        # Cast updated to dict[str, object] as well
        u_dict = cast("dict[str, object]", updated)

        result: CancelResult = {
            "booking_id": str(u_dict["booking_id"]),
            "previous_status": str(b_dict["status"]),
            "new_status": str(u_dict["status"]),
            "cancelled_by": str(u_dict["cancelled_by"]),
            "cancellation_reason": str(u_dict["cancellation_reason"]) if u_dict.get("cancellation_reason") else None,
        }

        return None, result

    except Exception as e:
        log("unexpected_exception", error=str(e), module=MODULE)
        return Exception(str(e)), None
    finally:
        await conn.close()


async def _main_async(args: dict[str, object]) -> Result[CancelResult]:
    """Windmill entrypoint."""
    return await main_async(args)


def main(args: dict[str, object]) -> Result[CancelResult]:
    import asyncio

    return asyncio.run(_main_async(args))
