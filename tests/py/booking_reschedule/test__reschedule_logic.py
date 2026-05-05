from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest

from f.booking_reschedule._reschedule_logic import execute_reschedule_logic

if TYPE_CHECKING:
    from f.booking_reschedule._reschedule_models import BookingRow, ServiceRow


@pytest.mark.asyncio
async def test_execute_reschedule_logic_success() -> None:
    repo = AsyncMock()

    input_data = AsyncMock()
    input_data.new_start_time = datetime(2026, 5, 20, 10, 0)

    old_booking: BookingRow = {
        "booking_id": "old-bk",
        "provider_id": "prov-1",
        "client_id": "client-1",
        "service_id": "svc-1",
        "status": "confirmed",
        "start_time": datetime(2026, 5, 10, 10, 0),
        "end_time": datetime(2026, 5, 10, 10, 30),
        "idempotency_key": "key-1",
    }

    service: ServiceRow = {"service_id": "svc-1", "duration_minutes": 30}

    repo.check_overlap.return_value = False
    repo.execute_reschedule.return_value = {
        "new_booking_id": "new-bk",
        "new_status": "confirmed",
        "new_start_time": "2026-05-20T10:00:00",
        "new_end_time": "2026-05-20T10:30:00",
        "old_booking_id": "old-bk",
        "old_status": "rescheduled",
    }

    err, res = await execute_reschedule_logic(repo, input_data, old_booking, service)

    assert err is None
    assert res is not None
    assert res["new_booking_id"] == "new-bk"
    repo.check_overlap.assert_called_once()


@pytest.mark.asyncio
async def test_execute_reschedule_logic_overlap() -> None:
    repo = AsyncMock()
    input_data = AsyncMock()
    input_data.new_start_time = datetime(2026, 5, 20, 10, 0)

    old_booking: BookingRow = {
        "booking_id": "old-bk",
        "provider_id": "prov-1",
        "client_id": "client-1",
        "service_id": "svc-1",
        "status": "confirmed",
        "start_time": datetime(2026, 5, 10, 10, 0),
        "end_time": datetime(2026, 5, 10, 10, 30),
        "idempotency_key": "key-1",
    }

    service: ServiceRow = {"service_id": "svc-1", "duration_minutes": 30}

    repo.check_overlap.return_value = True

    err, res = await execute_reschedule_logic(repo, input_data, old_booking, service)

    assert err is not None
    assert "already_booked" in str(err)
    assert res is None
