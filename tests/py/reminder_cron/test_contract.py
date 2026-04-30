from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.reminder_cron.main import _main_async as main

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine


@pytest.mark.asyncio
async def test_reminder_cron_success() -> None:
    mock_db = AsyncMock()

    # 1. Fetch all providers
    mock_db.fetch.side_effect = [
        [{"provider_id": "p1"}],  # providers list
        [
            {  # 24h window bookings
                "booking_id": "b1",
                "client_id": "c1",
                "provider_id": "p1",
                "start_time": "2026-05-01T10:00:00Z",
                "end_time": "2026-05-01T10:30:00Z",
                "status": "confirmed",
                "reminder_24h_sent": False,
                "reminder_2h_sent": False,
                "reminder_30min_sent": False,
                "client_telegram_chat_id": "123",
                "client_email": "t@t.com",
                "client_name": "Patient",
                "provider_name": "Dr",
                "service_name": "S",
                "reminder_preferences": None,
            }
        ],
        [],  # 2h window bookings
        [],  # 30min window bookings
    ]

    async def mock_with_tenant(db: object, tid: str, op: Callable[[], Coroutine[Any, Any, object]]) -> object:
        return await op()

    with (
        patch("f.reminder_cron.main.create_db_client", return_value=mock_db),
        patch("f.reminder_cron.main.with_tenant_context", side_effect=mock_with_tenant),
        patch("f.internal._wmill_adapter.wmill.run_script_by_path", return_value=(None, {"sent": True})),
    ):
        args: dict[str, Any] = {"dry_run": False}
        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["reminders_24h_sent"] == 1
        assert result["reminders_2h_sent"] == 0
        assert result["reminders_30min_sent"] == 0
        assert "b1" in result["processed_bookings"]
        assert mock_db.execute.called  # Mark as sent
