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

from typing import Any
from pydantic import ValidationError
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import with_tenant_context, Result
from ._booking_cancel_models import CancelBookingInput, CancelResult, UpdatedBooking
from ._booking_cancel_repository import PostgresBookingCancelRepository
from ._cancel_booking_logic import execute_cancel_booking, authorize_actor

MODULE = "booking_cancel"

async def main(args: object) -> tuple[Exception | None, CancelResult | None]:
    raw_input: Any
    if isinstance(args, dict) and "rawInput" in args:
        raw_input = args["rawInput"]
    else:
        raw_input = args

    try:
        if not isinstance(raw_input, dict):
            raise ValueError("Input must be a JSON object")
        input_data = CancelBookingInput.model_validate(raw_input)
    except ValidationError as e:
        log("validation_failed", error=str(e), module=MODULE)
        return (Exception(f"validation_error: {e}"), None)
    except Exception as e:
        log("validation_failed", error=str(e), module=MODULE)
        return (Exception(f"validation_error: {e}"), None)

    try:
        conn = await create_db_client()
    except Exception as e:
        return (Exception(f"configuration_error: {e}"), None)

    try:
        repo = PostgresBookingCancelRepository(conn)
        
        # Initial Lookup (Outside of Tenant Context Transaction? 
        # TS code fetches outside the tenant context to find the provider_id)
        booking = await repo.fetch_booking(input_data.booking_id)
        if not booking:
            return (Exception(f"booking_not_found: {input_data.booking_id}"), None)

        err_auth, _ = authorize_actor(input_data, booking)
        if err_auth is not None:
            return (err_auth, None)

        async def operation() -> Result[UpdatedBooking]:
            return await execute_cancel_booking(repo, input_data, booking)
        
        err, updated = await with_tenant_context(conn, booking["provider_id"], operation)
        
        if err is not None:
            log("transaction_failed", error=str(err), module=MODULE)
            return (err, None)

        if not updated:
            return (Exception("cancel_failed: no result returned"), None)
            
        result: CancelResult = {
            "booking_id": updated["booking_id"],
            "previous_status": booking["status"],
            "new_status": updated["status"],
            "cancelled_by": updated["cancelled_by"],
            "cancellation_reason": updated["cancellation_reason"]
        }
        
        return (None, result)

    except Exception as e:
        log("unexpected_exception", error=str(e), module=MODULE)
        return (Exception(str(e)), None)
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]
