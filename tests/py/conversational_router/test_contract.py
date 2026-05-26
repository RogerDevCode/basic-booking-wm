from __future__ import annotations

from typing import Any, cast

import pytest

from f.internal.conversational_router.main import _main_async


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "intent,expected_state",
    [
        ("saludo", "idle"),
        ("despedida", "idle"),
        ("agradecimiento", "idle"),
        ("mostrar_menu_principal", "idle"),
        ("activar_recordatorios", "reminders_config"),
        ("desactivar_recordatorios", "reminders_config"),
        ("preferencias_recordatorio", "reminders_config"),
        ("pregunta_general", "información"),
        ("desconocido", "información"),
    ],
)
async def test_conversational_handler(intent: str, expected_state: str) -> None:
    """Un test por cada entrada del _INTENT_TO_HANDLER map."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "user_input": "test",
        "ai_intent": intent,
        "ai_confidence": 0.9,
        "current_state_name": "idle",
    }
    if expected_state == "reminders_config":
        args["client_id"] = "c1"
        from unittest.mock import AsyncMock, patch

        from f.reminder_config._config_models import (
            ChannelPreferences,
            ReminderConfigResult,
            ReminderPreferences,
            WindowPreferences,
        )

        mock_pref = ReminderPreferences(
            channels=ChannelPreferences(telegram=True, email=False),
            windows=WindowPreferences(
                w_1day=True, w_24h=False, w_12h=False, w_6h=False, w_2h=False, w_1h=False, w_30min=False
            ),
        )
        mock_result = ReminderConfigResult(
            message="Status: Telegram is active.", inline_buttons=[], preferences=mock_pref
        )
        with patch("f.internal.conversational_router.main.run_reminder_config", new_callable=AsyncMock) as mock_config:
            mock_config.return_value = mock_result
            res = await _main_async(args)
    else:
        res = await _main_async(args)

    assert res["data"]["handled"] is True
    assert res["data"]["nextState"]["name"] == expected_state


@pytest.mark.asyncio
async def test_conversational_greeting_contains_menu() -> None:
    """Saludo debe incluir menú principal."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "user_input": "hola",
        "ai_intent": "saludo",
        "ai_confidence": 0.95,
        "current_state_name": "idle",
    }
    res = await _main_async(args)
    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is True
    assert "Hola" in data["response_text"]
    assert "Menú Principal" in data["response_text"]


@pytest.mark.asyncio
async def test_conversational_farewell() -> None:
    """Despedida retorna mensaje de cierre."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "user_input": "chao",
        "ai_intent": "despedida",
        "ai_confidence": 0.95,
        "current_state_name": "idle",
    }
    res = await _main_async(args)
    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is True
    assert "Hasta pronto" in data["response_text"]


@pytest.mark.asyncio
async def test_conversational_menu_returns_idle() -> None:
    """Mostrar menú principal resetea a idle."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "user_input": "menú",
        "ai_intent": "mostrar_menu_principal",
        "ai_confidence": 0.9,
        "current_state_name": "información",
    }
    res = await _main_async(args)
    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is True
    assert data["nextState"]["name"] == "idle"


@pytest.mark.asyncio
async def test_conversational_mis_citas_no_client() -> None:
    """Mis citas sin client_id retorna mensaje amigable."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "user_input": "ver mis citas",
        "ai_intent": "ver_mis_citas",
        "ai_confidence": 0.9,
        "current_state_name": "idle",
        "client_id": None,
    }
    res = await _main_async(args)
    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is True
    assert "Mis Horas" in data["response_text"]
