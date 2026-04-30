from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from f.availability_check.main import _main_async as main


@pytest.mark.asyncio
async def test_availability_check_success() -> None:
    mock_db = AsyncMock()

    # Mock for get_provider
    provider_row = {"provider_id": "p1", "name": "Dr. Smith", "timezone": "UTC"}

    # Mock for get_provider_service_id
    service_id = "s1"

    # Mock for get_availability internal calls
    # 1. get_provider
    # 2. get_provider_service_id
    # 3. get_availability (Layer 2: overrides)
    # 4. get_availability (Layer 1: rules)
    # 5. get_availability (Layer 3: bookings)
    # 6. get_availability (service details)

    mock_db.fetch.side_effect = [
        [provider_row],  # get_provider
        [{"service_id": service_id}],  # get_provider_service_id
        [],  # schedule_overrides
        [
            {"id": 1, "provider_id": "p1", "day_of_week": 5, "start_time": "09:00", "end_time": "10:00"}
        ],  # provider_schedules (Friday)
        [],  # bookings
        [{"service_id": service_id, "duration_minutes": 30, "buffer_minutes": 0}],  # services
    ]

    with patch("f.availability_check.main.create_db_client", return_value=mock_db):
        args: dict[str, Any] = {
            "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "provider_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567891",
            "date": "2026-05-01",  # Friday
        }

        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["provider_name"] == "Dr. Smith"
        assert len(result["slots"]) == 2  # 09:00, 09:30
        assert result["slots"][0]["start"].endswith("T09:00:00Z")
        assert result["slots"][1]["start"].endswith("T09:30:00Z")


@pytest.mark.asyncio
async def test_availability_check_blocked() -> None:
    mock_db = AsyncMock()

    mock_db.fetch.side_effect = [
        [{"provider_id": "p1", "name": "Dr. Smith", "timezone": "UTC"}],  # get_provider
        [{"service_id": "s1"}],  # get_provider_service_id
        [{"override_id": "o1", "is_blocked": True, "reason": "Holiday"}],  # schedule_overrides
    ]

    with patch("f.availability_check.main.create_db_client", return_value=mock_db):
        args: dict[str, Any] = {
            "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "provider_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567891",
            "date": "2026-05-01",
        }

        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["is_blocked"] is True
        assert result["block_reason"] == "Holiday"
        assert len(result["slots"]) == 0
