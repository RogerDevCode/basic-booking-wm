from __future__ import annotations

from typing import TYPE_CHECKING

from ..internal._result import Result, fail, ok
from ..internal._state_machine import validate_transition

if TYPE_CHECKING:
    from ._booking_cancel_models import BookingLookup, CancelBookingInput, UpdatedBooking
    from ._booking_cancel_repository import BookingCancelRepository


def authorize_actor(input_data: CancelBookingInput, booking: BookingLookup) -> Result[None]:
    """
    Validates that the actor has permission to cancel the booking.
    """
    try:
        if input_data.actor == "client" and booking["client_id"] != input_data.actor_id:
            return fail(Exception("unauthorized: client_id mismatch"))

        if input_data.actor == "provider" and booking["provider_id"] != input_data.actor_id:
            return fail(Exception("unauthorized: provider_id mismatch"))

        if input_data.actor == "system":
            # System can always cancel
            pass

        return ok(None)
    except Exception as e:
        return fail(f"authorization_check_failed: {e}")


async def execute_cancel_booking(
    repo: BookingCancelRepository, input_data: CancelBookingInput, booking: BookingLookup
) -> Result[UpdatedBooking]:
    """
    Orchestrates the cancellation transaction with strict error capture.
    """
    try:
        # 1. Row Locking & Status Verification
        try:
            current_status = await repo.lock_booking(input_data.booking_id)
            if not current_status:
                return fail("booking_lost_during_transaction")
        except Exception as e:
            return fail(f"db_lock_failed: {e}")

        # 2. Idempotency check
        if current_status == "cancelled":
            return fail("booking_already_cancelled")

        # 3. State Machine Validation
        try:
            err_trans, _ = validate_transition(current_status, "cancelled")
            if err_trans is not None:
                return fail(err_trans)
        except Exception as e:
            return fail(f"state_validation_failed: {e}")

        # 4. Status Update
        try:
            updated = await repo.update_booking_status(input_data)
            if not updated:
                return fail("failed_to_update_booking_status")
        except Exception as e:
            return fail(f"db_update_failed: {e}")

        # 5. Audit Trail
        try:
            await repo.insert_audit_trail(input_data, booking)
        except Exception as e:
            # Audit failure shouldn't necessarily block cancellation, but we log it
            # In strict mode, we'll treat it as a failure for data integrity
            return fail(f"audit_trail_failed: {e}")

        # 6. Side Effects: GCal Sync
        try:
            if booking.get("gcal_provider_event_id") or booking.get("gcal_client_event_id"):
                await repo.trigger_gcal_sync(input_data.booking_id)
        except Exception as e:
            # Side effect failure is logged but we already persisted the cancellation
            # We return success but could log the secondary error
            from ..internal._wmill_adapter import log

            log("GCAL_SYNC_TRIGGER_FAILED", error=str(e), booking_id=input_data.booking_id)

        return ok(updated)

    except Exception as e:
        return fail(f"unexpected_cancel_logic_error: {e}")
