from typing import Any
from typing import cast
from unittest.mock import AsyncMock, patch

import pytest

from f.gcal_sync.main import main

VALID_TENANT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
VALID_BOOKING_ID = "b2c3d4e5-f6a7-8901-bcde-f12345678901"


@pytest.mark.asyncio
async def test_gcal_sync_success() -> None:
    mock_db = AsyncMock()

    # 1. fetch_booking_details
    booking_details = {
        "booking_id": VALID_BOOKING_ID,
        "provider_id": "p1",
        "status": "confirmed",
        "start_time": "2026-05-01T10:00:00Z",
        "end_time": "2026-05-01T10:30:00Z",
        "provider_name": "Dr. Smith",
        "service_name": "Consultation",
        "gcal_provider_event_id": None,
        "gcal_client_event_id": None,
        "provider_calendar_id": "cal-p1",
        "provider_gcal_access_token": "token1",
        "provider_gcal_refresh_token": None,
        "provider_gcal_client_id": None,
        "provider_gcal_client_secret": None,
        "client_calendar_id": None,
    }

    mock_db.fetch.return_value = [booking_details]

    with (
        patch("f.gcal_sync.main.create_db_client", return_value=mock_db),
        patch("f.gcal_sync._sync_event_logic.call_gcal_api", AsyncMock(return_value=(None, {"id": "new-event-123"}))),
    ):
        args: dict[str, Any] = {"booking_id": VALID_BOOKING_ID, "tenant_id": VALID_TENANT_ID, "action": "create"}

        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["sync_status"] == "synced"
        assert result["provider_event_id"] == "new-event-123"


@pytest.mark.asyncio
async def test_gcal_sync_failure() -> None:
    mock_db = AsyncMock()
    mock_db.fetch.return_value = [
        {
            "booking_id": VALID_BOOKING_ID,
            "provider_id": "p1",
            "status": "confirmed",
            "start_time": "2026-05-01T10:00:00Z",
            "end_time": "2026-05-01T10:30:00Z",
            "provider_name": "Dr. Smith",
            "service_name": "Consultation",
            "gcal_provider_event_id": None,
            "gcal_client_event_id": None,
            "provider_calendar_id": "cal-p1",
            "provider_gcal_access_token": "token1",
            "provider_gcal_refresh_token": None,
            "provider_gcal_client_id": None,
            "provider_gcal_client_secret": None,
            "client_calendar_id": None,
        }
    ]

    with (
        patch("f.gcal_sync.main.create_db_client", return_value=mock_db),
        patch("f.gcal_sync._sync_event_logic.call_gcal_api", AsyncMock(return_value=(Exception("API Error"), None))),
    ):
        args: dict[str, Any] = {"booking_id": VALID_BOOKING_ID, "tenant_id": VALID_TENANT_ID, "action": "create"}

        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["sync_status"] == "pending"
        assert len(result["errors"]) > 0
