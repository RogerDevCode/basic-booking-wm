from __future__ import annotations

from datetime import UTC, datetime

from f.internal._config import DEFAULT_TIMEZONE
from f.reminder_cron._window_policy import is_due, is_quiet_hours, scheduled_time_for_window


def test_scheduled_time_for_1day_uses_previous_day_local_8am() -> None:
    start_time = datetime(2026, 5, 10, 15, 0, tzinfo=UTC)

    scheduled = scheduled_time_for_window(start_time, DEFAULT_TIMEZONE, "1day")

    assert scheduled.tzinfo == UTC
    assert scheduled < start_time


def test_is_due_for_1day_is_true_inside_tolerance_window() -> None:
    booking_start = datetime(2026, 5, 10, 15, 0, tzinfo=UTC)
    due_at = scheduled_time_for_window(booking_start, "UTC", "1day")

    assert is_due(due_at, booking_start, "UTC", "1day") is True


def test_is_quiet_hours_detects_early_morning_local_time() -> None:
    send_time = datetime(2026, 5, 10, 5, 0, tzinfo=UTC)

    assert is_quiet_hours(send_time, "UTC") is True


def test_is_quiet_hours_allows_business_hour_local_time() -> None:
    send_time = datetime(2026, 5, 10, 14, 0, tzinfo=UTC)

    assert is_quiet_hours(send_time, "UTC") is False
