from __future__ import annotations

from f.reminder_config._config_service import default_preferences, toggle_window
from f.reminder_config._config_view import build_config_view


def test_build_config_view_contains_expected_callbacks() -> None:
    view = build_config_view(default_preferences())

    callback_data = [button.callback_data for row in view.inline_buttons for button in row]

    assert "rem:ch:telegram" in callback_data
    assert "rem:w:1day" in callback_data
    assert "rem:w:24h" in callback_data
    assert "rem:off" in callback_data
    assert "rem:all" in callback_data
    assert "rem:back" in callback_data


def test_build_config_view_reflects_window_toggle() -> None:
    preferences = toggle_window(default_preferences(), "12h")

    view = build_config_view(preferences)
    labels = [button.text for row in view.inline_buttons for button in row]

    assert "☑️ 12 horas" in labels
