import pytest
from f.booking_cancel._cancel_booking_logic import execute_cancel_booking
from f.booking_cancel._booking_cancel_models import CancelBookingInput, BookingLookup, UpdatedBooking
from f.internal._state_machine import BookingStatus

class MockCancelRepository:
    async def fetch_booking(self, booking_id: str) -> BookingLookup | None:
        return {
            "booking_id": booking_id,
            "status": "confirmada",
            "client_id": "client_1",
            "provider_id": "provider_1",
            "gcal_provider_event_id": None,
            "gcal_client_event_id": None
        }

    async def lock_booking(self, booking_id: str) -> BookingStatus | None:
        return "confirmada"

    async def update_booking_status(self, input_data: CancelBookingInput) -> UpdatedBooking | None:
        return {
            "booking_id": input_data.booking_id,
            "status": "cancelada",
            "cancelled_by": input_data.actor,
            "cancellation_reason": input_data.reason
        }

    async def insert_audit_trail(self, input_data: CancelBookingInput, booking: BookingLookup) -> None:
        pass

    async def trigger_gcal_sync(self, booking_id: str) -> None:
        pass

@pytest.mark.asyncio
async def test_booking_cancel_success() -> None:
    from f.booking_cancel._cancel_booking_logic import execute_cancel_booking
    
    repo = MockCancelRepository()
    input_data = CancelBookingInput.model_validate({
        "booking_id": "00000000-0000-0000-0000-000000000000",
        "actor": "client",
        "actor_id": "client_1",
        "reason": "Changed my mind"
    })
    booking = await repo.fetch_booking(input_data.booking_id)
    assert booking is not None

    err, result = await execute_cancel_booking(repo, input_data, booking)
    
    assert err is None
    assert result is not None
    assert result["status"] == "cancelada"
    assert result["cancelled_by"] == "client"
    assert result["cancellation_reason"] == "Changed my mind"
