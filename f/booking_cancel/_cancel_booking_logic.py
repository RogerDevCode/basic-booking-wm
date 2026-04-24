from ..internal._result import Result, ok, fail
from ..internal._state_machine import validate_transition
from ._booking_cancel_models import CancelBookingInput, BookingLookup, UpdatedBooking
from ._booking_cancel_repository import BookingCancelRepository

def authorize_actor(
    input_data: CancelBookingInput,
    booking: BookingLookup
) -> Result[None]:
    if input_data.actor == 'client' and booking["client_id"] != input_data.actor_id:
        return fail(Exception("unauthorized: client_id mismatch"))
    
    if input_data.actor == 'provider' and booking["provider_id"] != input_data.actor_id:
        return fail(Exception("unauthorized: provider_id mismatch"))
        
    return ok(None)

async def execute_cancel_booking(
    repo: BookingCancelRepository,
    input_data: CancelBookingInput,
    booking: BookingLookup
) -> Result[UpdatedBooking]:
    
    current_status = await repo.lock_booking(input_data.booking_id)
    if not current_status:
        return fail(Exception("booking_lost_during_transaction"))
        
    if current_status == 'cancelled':
        return fail(Exception("booking_already_cancelled"))

    err, _ = validate_transition(current_status, 'cancelled')
    if err is not None:
        return fail(err)

    updated = await repo.update_booking_status(input_data)
    if not updated:
        return fail(Exception("failed_to_update_booking_status"))

    await repo.insert_audit_trail(input_data, booking)

    if booking["gcal_provider_event_id"] or booking["gcal_client_event_id"]:
        await repo.trigger_gcal_sync(input_data.booking_id)

    return ok(updated)
