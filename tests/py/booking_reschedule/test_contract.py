import pytest
from datetime import datetime, timedelta, timezone
from typing import Any
from f.booking_reschedule._reschedule_logic import execute_reschedule_logic
from f.booking_reschedule._reschedule_models import RescheduleInput, BookingRow, RescheduleWriteResult

class MockRescheduleRepository:
    async def check_overlap(self, provider_id: str, exclude_id: str, start: datetime, end: datetime):
        return False

    async def execute_reschedule(self, input_data: RescheduleInput, old_booking: BookingRow, service: Any, new_end: datetime, new_key: str) -> RescheduleWriteResult:
        return {
            "new_booking_id": "new_b",
            "new_status": "confirmed",
            "new_start_time": input_data.new_start_time,
            "new_end_time": new_end,
            "old_booking_id": old_booking["booking_id"],
            "old_status": "rescheduled"
        }

from typing import Any

@pytest.mark.asyncio
async def test_reschedule_success() -> None:
    repo = MockRescheduleRepository()
    input_data = RescheduleInput.model_validate({
        "booking_id": "old_b",
        "actor": "client",
        "actor_id": "client_1",
        "new_start_time": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "idempotency_key": "idem_1"
    })
    
    old_booking = {
        "booking_id": "old_b",
        "provider_id": "p1",
        "client_id": "client_1",
        "service_id": "s1",
        "status": "confirmed",
        "idempotency_key": "old_ik"
    }
    
    service = {"service_id": "s1", "duration_minutes": 30}

    err, result = await execute_reschedule_logic(repo, input_data, old_booking, service)

    assert err is None
    assert result is not None
    assert result["new_status"] == "confirmed"
    assert result["old_status"] == "rescheduled"
