from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from returns.result import Failure, Success

from f.internal.telegram_router._router_models import RouterInput, RouterResult
from f.internal.telegram_router._router_reminders import handle_reminders_config
from f.reminder_config._config_models import (
    ChannelPreferences,
    InlineButton,
    ReminderConfigResult,
    ReminderPreferences,
    WindowPreferences,
)


def _result_payload() -> ReminderConfigResult:
    return ReminderConfigResult(
        message="🔔 *Recordatorios*",
        inline_buttons=[[InlineButton(text="📱 Telegram ✅", callback_data="rem:ch:telegram")]],
        preferences=ReminderPreferences(
            channels=ChannelPreferences(telegram=True, email=True),
            windows=WindowPreferences(
                w_1day=True,
                w_24h=True,
                w_12h=False,
                w_6h=False,
                w_2h=True,
                w_1h=False,
                w_30min=True,
            ),
        ),
    )


@pytest.mark.asyncio
@patch("f.internal.telegram_router._router_reminders.run_reminder_config", new_callable=AsyncMock)
async def test_handle_reminders_config_show_returns_reminders_state(mock_run: AsyncMock) -> None:
    mock_run.return_value = (None, _result_payload())
    input_data = RouterInput(chat_id="1", user_input="3", state={}, client_id="c1")

    result = await handle_reminders_config(input_data, {"name": "idle"})

    match result:
        case Success(payload):
            assert isinstance(payload, RouterResult)
            assert payload.nextState == {"name": "reminders_config", "client_id": "c1"}
            assert payload.inline_buttons is not None
        case Failure(err):
            raise AssertionError(str(err))


@pytest.mark.asyncio
@patch("f.internal.telegram_router._router_reminders.run_reminder_config", new_callable=AsyncMock)
async def test_handle_reminders_config_callback_sets_edit_message(mock_run: AsyncMock) -> None:
    mock_run.return_value = (None, _result_payload())
    input_data = RouterInput(
        chat_id="1",
        user_input="rem:w:12h",
        state={},
        client_id="c1",
        callback_message_id=42,
    )

    result = await handle_reminders_config(input_data, {"name": "reminders_config", "client_id": "c1"})

    match result:
        case Success(payload):
            assert payload.edit_message is True
        case Failure(err):
            raise AssertionError(str(err))
