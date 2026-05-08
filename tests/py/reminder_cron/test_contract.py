from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from f.reminder_cron._reminder_models import BookingRecord
from f.reminder_cron.main import _main_async as main


@pytest.mark.asyncio
async def test_reminder_cron_success() -> None:
    mock_db = AsyncMock()
    candidate = BookingRecord.model_validate(
        {
            "booking_id": "b1",
            "client_id": "c1",
            "provider_id": "p1",
            "start_time": datetime.now(UTC) + datetime.resolution,
            "end_time": datetime.now(UTC) + datetime.resolution,
            "status": "confirmed",
            "client_telegram_chat_id": "123",
            "client_email": "t@t.com",
            "client_name": "Patient",
            "reminder_preferences": {
                "channels": {"telegram": True, "email": True},
                "windows": {
                    "w_1day": True,
                    "w_24h": True,
                    "w_12h": False,
                    "w_6h": False,
                    "w_2h": True,
                    "w_1h": False,
                    "w_30min": True,
                },
            },
            "provider_name": "Dr",
            "service_name": "S",
            "provider_timezone": "America/Santiago",
        }
    )

    with (
        patch("f.reminder_cron.main.create_db_client", return_value=mock_db),
        patch(
            "f.reminder_cron.main.offset_window_ranges",
            return_value=[("24h", datetime.now(UTC), datetime.now(UTC))],
        ),
        patch("f.reminder_cron.main.one_day_candidate_range", return_value=(datetime.now(UTC), datetime.now(UTC))),
        patch("f.reminder_cron.main.get_candidates_between", side_effect=[[candidate], []]),
        patch("f.reminder_cron.main.claim_dispatch", new_callable=AsyncMock, return_value=True),
        patch("f.reminder_cron.main.persist_dispatch_decision", new_callable=AsyncMock),
        patch("f.reminder_cron.main.dispatch_reminder", return_value=(None, None)),
        patch("f.reminder_cron.main.scheduled_time_for_window", return_value=datetime.now(UTC).replace(hour=15)),    ):
        args: dict[str, Any] = {"dry_run": False}
        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result.sent == 2
        assert result.failed == 0
        assert "b1" in result.processed_bookings
        assert mock_db.close.called
