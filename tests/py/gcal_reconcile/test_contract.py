from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.gcal_reconcile.main import _main_async as main

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine

VALID_TENANT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


@pytest.mark.asyncio
async def test_gcal_reconcile_success() -> None:
    mock_db = AsyncMock()

    # 1. Fetch all active providers
    mock_db.fetch.side_effect = [
        [{"provider_id": VALID_TENANT_ID}],  # providers list
        [
            {  # bookings for provider 1
                "booking_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
                "status": "confirmed",
                "start_time": "2026-05-01T10:00:00Z",
                "end_time": "2026-05-01T10:30:00Z",
                "gcal_provider_event_id": None,
                "gcal_client_event_id": None,
                "gcal_retry_count": 0,
                "provider_name": "Dr. Smith",
                "provider_calendar_id": "cal-p1",
                "client_name": "Test Client",
                "client_calendar_id": None,
                "service_name": "Consultation",
            }
        ],
    ]

    # Mock with_tenant_context
    async def mock_with_tenant(db: object, tid: str, op: Callable[[], Coroutine[Any, Any, object]]) -> object:
        return await op()

    # Mock sync_booking_to_gcal logic (the internal call in main)
    # Actually main.py calls reconcile_logic.sync_booking_to_gcal

    with (
        patch("f.gcal_reconcile.main.create_db_client", return_value=mock_db),
        patch("f.gcal_reconcile.main.with_tenant_context", side_effect=mock_with_tenant),
        patch(
            "f.gcal_reconcile.main.sync_booking_to_gcal",
            AsyncMock(return_value={"providerEventId": "new-p-123", "clientEventId": None, "errors": []}),
        ),
    ):
        args: dict[str, Any] = {"dry_run": False, "batch_size": 10}

        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["processed"] == 1
        assert result["synced"] == 1
        assert len(result["errors"]) == 0
        # Verify DB update call
        assert mock_db.execute.called
