from __future__ import annotations

# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Create a new medical appointment (SOLID Refactor)
# DB Tables Used  : bookings, providers, clients, services, schedule_overrides, provider_schedules, booking_audit
# Concurrency Risk: YES — GIST exclusion constraint + SELECT FOR UPDATE on provider
# GCal Calls      : NO — gcal_sync handles async sync after creation
# Idempotency Key : YES — ON CONFLICT (idempotency_key) handled
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Zod Schemas     : YES — InputSchema validates all inputs
# ============================================================================
from pydantic import ValidationError

from ..internal._db_client import create_db_client
from ..internal._result import Result, with_tenant_context
from ..internal._wmill_adapter import log
from ._booking_create_models import BookingCreated, InputSchema
from ._booking_create_repository import PostgresBookingCreateRepository
from ._create_booking_logic import execute_create_booking

MODULE = "booking_create"


async def main_async(args: dict[str, object]) -> Result[BookingCreated]:
    try:
        input_data = InputSchema.model_validate(args)
    except ValidationError as e:
        log("Validation failed", error=str(e), module=MODULE)
        return Exception(f"Validation error: {e}"), None
    except Exception as e:
        log("Validation failed", error=str(e), module=MODULE)
        return Exception(f"Validation error: {e}"), None

    try:
        conn = await create_db_client()
    except Exception as e:
        return Exception(f"CONFIGURATION_ERROR: {e}"), None

    try:
        repo = PostgresBookingCreateRepository(conn)

        async def operation() -> Result[BookingCreated]:
            return await execute_create_booking(repo, input_data)

        err, result = await with_tenant_context(conn, input_data.provider_id, operation)

        if err is not None:
            msg = str(err)
            log("Transaction failed", error=msg, idempotency_key=input_data.idempotency_key, module=MODULE)
            if "duplicate key" in msg or "unique constraint" in msg:
                return Exception("A booking with this idempotency key already exists"), None
            if "booking_no_overlap" in msg or "exclusion constraint" in msg:
                return Exception("This time slot was just booked. Please choose a different time."), None
            return err, None

        if not result:
            log("Transaction succeeded but no result returned", module=MODULE)
            return Exception("Booking creation failed: no result"), None

        log("Booking creation complete", booking_id=str(result["booking_id"]), module=MODULE)
        return None, result

    except Exception as e:
        log("Unexpected infrastructure error", error=str(e), module=MODULE)
        msg = str(e)
        if "duplicate key" in msg or "unique constraint" in msg:
            return Exception("A booking with this idempotency key already exists"), None
        if "booking_no_overlap" in msg or "exclusion constraint" in msg:
            return Exception("This time slot was just booked. Please choose a different time."), None
        return Exception(f"Internal error: {msg}"), None
    finally:
        await conn.close()


async def main(args: dict[str, object]) -> Result[BookingCreated]:
    """Windmill entrypoint."""
    return await main_async(args)
