from __future__ import annotations

from f.reminder_config._config_service import (
    activate_all,
    deactivate_all,
    default_preferences,
    toggle_channel,
    toggle_window,
)


def test_toggle_channel_telegram_flips_expected_flag() -> None:
    preferences = default_preferences()

    updated = toggle_channel(preferences, "telegram")

    assert updated.channels.telegram is False
    assert updated.channels.email is True
    assert preferences.channels.telegram is True


def test_toggle_window_12h_flips_expected_flag() -> None:
    preferences = default_preferences()

    updated = toggle_window(preferences, "12h")

    assert updated.windows.w_12h is True
    assert preferences.windows.w_12h is False


def test_deactivate_all_turns_everything_off() -> None:
    preferences = default_preferences()

    updated = deactivate_all(preferences)

    assert updated.channels.telegram is False
    assert updated.channels.email is False
    assert updated.windows.w_1day is False
    assert updated.windows.w_24h is False
    assert updated.windows.w_12h is False
    assert updated.windows.w_6h is False
    assert updated.windows.w_2h is False
    assert updated.windows.w_1h is False
    assert updated.windows.w_30min is False


def test_activate_all_restores_defaults() -> None:
    updated = activate_all()

    assert updated.channels.telegram is True
    assert updated.channels.email is True
    assert updated.windows.w_1day is True
    assert updated.windows.w_24h is True
    assert updated.windows.w_12h is False
