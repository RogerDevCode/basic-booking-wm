import pytest
from datetime import datetime, timezone
from f.booking_reschedule._reschedule_logic import execute_reschedule_logic
from f.booking_reschedule._reschedule_models import RescheduleInput, BookingRow, ServiceRow, RescheduleWriteResult

class MockRescheduleRepository:
    async def fetch_booking(self, booking_id: str) -> BookingRow | None:
        return {
            "booking_id": booking_id,
            "provider_id": "provider_1",
            "client_id": "client_1",
            "service_id": "service_1",
            "status": "confirmada",
            "start_time": datetime.now(timezone.utc),
            "end_time": datetime.now(timezone.utc),
            "idempotency_key": "idem_1"
        }

    async def fetch_service(self, service_id: str) -> ServiceRow | None:
        return {
            "service_id": service_id,
            "duration_minutes": 30
        }

    async def check_overlap(self, provider_id: str, exclude_booking_id: str, new_start: datetime, new_end: datetime) -> bool:
        return False

    async def execute_reschedule(
        self, 
        input_data: RescheduleInput, 
        old_booking: BookingRow, 
        service: ServiceRow, 
        new_end: datetime, 
        new_key: str
    ) -> RescheduleWriteResult | None:
        return {
            "new_booking_id": "new_booking_1",
            "new_status": "confirmada",
            "new_start_time": input_data.new_start_time.isoformat(),
            "new_end_time": new_end.isoformat(),
            "old_booking_id": old_booking["booking_id"],
            "old_status": "reagendada"
        }

@pytest.mark.asyncio
async def test_booking_reschedule_success() -> None:
    repo = MockRescheduleRepository()
    input_data = RescheduleInput.model_validate({
        "booking_id": "old_booking_1",
        "new_start_time": datetime.now(timezone.utc).isoformat(),
        "actor": "client",
        "actor_id": "client_1",
        "reason": "Needed a new time"
    })
    old_booking = await repo.fetch_booking(input_data.booking_id)
    assert old_booking is not None
    
    service = await repo.fetch_service(old_booking["service_id"])
    assert service is not None

    err, result = await execute_reschedule_logic(repo, input_data, old_booking, service)
    
    assert err is None
    assert result is not None
    assert result["new_booking_id"] == "new_booking_1"
    assert result["new_status"] == "confirmada"
    assert result["old_status"] == "reagendada"
