from typing import Any
from datetime import UTC, datetime

import pytest

from f.booking_create._booking_create_models import (
    BookingCreated,
    ClientContext,
    InputSchema,
    ProviderContext,
    ServiceContext,
)
from f.booking_create._create_booking_logic import execute_create_booking


class MockBookingRepository:
    async def get_client_context(self, client_id: str) -> ClientContext | None:
        return {"id": client_id, "name": "Test Client"}

    async def get_provider_context(self, provider_id: str) -> ProviderContext | None:
        return {"id": provider_id, "name": "Dr. Test", "timezone": "UTC"}

    async def get_service_context(self, service_id: str, provider_id: str) -> ServiceContext | None:
        return {"id": service_id, "name": "General Checkup", "duration": 30}

    async def is_provider_blocked(self, provider_id: str, target_date: Any) -> bool:
        return False

    async def is_provider_scheduled(self, provider_id: str, day_of_week: int) -> bool:
        return True

    async def has_overlapping_booking(self, provider_id: str, start_time: datetime, end_time: datetime) -> bool:
        return False

    async def insert_booking(
        self,
        input_data: InputSchema,
        end_time: datetime,
        target_status: str,
        provider_name: str,
        service_name: str,
        client_name: str,
    ) -> BookingCreated:
        return {
            "booking_id": "00000000-0000-0000-0000-000000000000",
            "status": target_status,
            "start_time": input_data.start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "provider_name": provider_name,
            "service_name": service_name,
            "client_name": client_name,
        }


@pytest.mark.asyncio
async def test_booking_create_success() -> None:
    repo = MockBookingRepository()
    input_data = InputSchema.model_validate(
        {
            "client_id": "11111111-1111-1111-1111-111111111111",
            "provider_id": "22222222-2222-2222-2222-222222222222",
            "service_id": "33333333-3333-3333-3333-333333333333",
            "start_time": datetime.now(UTC).isoformat(),
            "idempotency_key": "test_idem_key",
            "notes": "Test notes",
        }
    )

    err, result = await execute_create_booking(repo, input_data)

    assert err is None
    assert result is not None
    assert result["status"] == "confirmed"
    assert result["provider_name"] == "Dr. Test"
    assert result["client_name"] == "Test Client"
