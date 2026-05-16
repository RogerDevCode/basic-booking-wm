# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "pydantic>=2.10.0",
#   "beartype>=0.19.0",
#   "returns>=0.24.0",
# ]
# ///
from __future__ import annotations

from typing import TYPE_CHECKING

from ...reminder_config._config_models import (
    InputSchema as ReminderConfigInput,
)
from ...reminder_config._config_models import (
    ReminderChannel,
    ReminderConfigAction,
    ReminderWindow,
)
from ...reminder_config.main import run_reminder_config

if TYPE_CHECKING:
    from ._router_models import RouterInput, RouterResult


async def handle_reminders_config(
    input_data: RouterInput,
    current_state_raw: dict[str, object],
) -> RouterResult:
    """
    Maneja la lógica de configuración de recordatorios en Telegram.
    Delega la lógica pesada a f/reminder_config/main.py.
    """
    from ._router_models import RouterResult

    if input_data.client_id is None:
        return RouterResult(
            handled=True,
            nextState={"name": "idle"},
            response_text="⚠️ Necesitas estar registrado para configurar recordatorios.",
        )

    user_input = input_data.user_input.strip()

    action: ReminderConfigAction = "show"
    channel: ReminderChannel | None = None
    window: ReminderWindow | None = None

    if user_input.startswith("rem:ch:"):
        raw_channel = user_input.replace("rem:ch:", "")
        if raw_channel not in {"telegram", "email"}:
            raise RuntimeError("invalid_reminder_channel")
        action = "toggle_channel"
        channel = "telegram" if raw_channel == "telegram" else "email"
    elif user_input.startswith("rem:w:"):
        raw_window = user_input.replace("rem:w:", "")
        if raw_window not in {"1day", "24h", "12h", "6h", "2h", "1h", "30min"}:
            raise RuntimeError("invalid_reminder_window")
        action = "toggle_window"
        match raw_window:
            case "1day":
                window = "1day"
            case "24h":
                window = "24h"
            case "12h":
                window = "12h"
            case "6h":
                window = "6h"
            case "2h":
                window = "2h"
            case "1h":
                window = "1h"
            case "30min":
                window = "30min"
            case _:
                pass
    elif user_input == "rem:off":
        action = "deactivate_all"
    elif user_input == "rem:all":
        action = "activate_all"
    elif user_input in {"back", "rem:back"}:
        action = "back"

    config_input = ReminderConfigInput(
        action=action,
        client_id=input_data.client_id,
        channel=channel,
        window=window,
    )
    res_config = await run_reminder_config(config_input, input_data.pg_url)

    if action == "back":
        from ..booking_fsm._fsm_machine import get_main_menu_text

        return RouterResult(
            handled=True,
            nextState={"name": "idle"},
            response_text="📋 Menú principal. ¿En qué puedo ayudarte?\n\n" + get_main_menu_text(),
        )

    return RouterResult(
        handled=True,
        nextState={"name": "reminders_config", "client_id": input_data.client_id},
        response_text=res_config.message,
        inline_buttons=res_config.inline_buttons,
        edit_message=input_data.callback_message_id is not None,
    )
