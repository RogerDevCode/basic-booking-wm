from __future__ import annotations

import pytest

from f.internal.conversational_router.main import _main_async as main


class TestConversationalRouter:
    @pytest.mark.asyncio
    async def test_greeting_handled(self) -> None:
        args = {
            "chat_id": "1",
            "user_input": "hola",
            "ai_intent": "saludo",
            "ai_confidence": 0.95,
            "current_state_name": "idle",
        }
        res = await main(args)
        data = res["data"]
        assert data["handled"] is True
        assert "¡Hola!" in data["response_text"]
        assert data["nextState"]["name"] == "idle"

    @pytest.mark.asyncio
    async def test_farewell_handled(self) -> None:
        args = {
            "chat_id": "1",
            "user_input": "adiós",
            "ai_intent": "despedida",
            "ai_confidence": 0.95,
            "current_state_name": "idle",
        }
        res = await main(args)
        data = res["data"]
        assert data["handled"] is True
        assert "¡Hasta pronto!" in data["response_text"]

    @pytest.mark.asyncio
    async def test_thanks_handled(self) -> None:
        args = {
            "chat_id": "1",
            "user_input": "gracias",
            "ai_intent": "agradecimiento",
            "ai_confidence": 0.95,
            "current_state_name": "idle",
        }
        res = await main(args)
        data = res["data"]
        assert data["handled"] is True
        assert "¡Con gusto!" in data["response_text"]

    @pytest.mark.asyncio
    async def test_menu_handled(self) -> None:
        args = {
            "chat_id": "1",
            "user_input": "menú",
            "ai_intent": "mostrar_menu_principal",
            "ai_confidence": 0.95,
            "current_state_name": "idle",
        }
        res = await main(args)
        data = res["data"]
        assert data["handled"] is True
        assert "Menú Principal" in data["response_text"]

    @pytest.mark.asyncio
    async def test_recordatorios_handled(self) -> None:
        args = {
            "chat_id": "1",
            "user_input": "recordatorios",
            "ai_intent": "activar_recordatorios",
            "ai_confidence": 0.95,
            "client_id": "c1",
            "current_state_name": "idle",
        }
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
            res = await main(args)
        data = res["data"]
        assert data["handled"] is True
        assert data["nextState"]["name"] == "reminders_config"

    @pytest.mark.asyncio
    async def test_mis_citas_happy_path(self) -> None:
        args = {
            "chat_id": "1",
            "user_input": "ver mis citas",
            "ai_intent": "ver_mis_citas",
            "ai_confidence": 0.95,
            "client_id": "c1",
            "pg_url": "postgresql://test:test@localhost:5432/test",
            "current_state_name": "idle",
        }
        from unittest.mock import AsyncMock, patch

        with patch("f.internal.conversational_router.main.get_mis_citas_data", new_callable=AsyncMock) as mock_query:
            mock_query.return_value = ("📋 *Mis Horas*\n\nDr. Smith...", None)
            res = await main(args)
            data = res["data"]
            assert data["handled"] is True
            assert "Dr. Smith" in data["response_text"]
            assert data["nextState"]["name"] == "idle"

    @pytest.mark.asyncio
    async def test_mis_datos_handled(self) -> None:
        args = {
            "chat_id": "1",
            "user_input": "5",
            "ai_intent": "ver_mis_datos",
            "ai_confidence": 0.95,
            "phone": "+34600000000",
            "client_name": "Test User",
            "current_state_name": "idle",
        }
        res = await main(args)
        data = res["data"]
        assert data["handled"] is True
        assert "Mis Datos" in data["response_text"]
        assert "Test User" in data["response_text"]

    @pytest.mark.asyncio
    async def test_rag_fallback(self) -> None:
        # We need a mock for run_rag_query or just test the logic that it calls it
        # For now, let's test that it returns something handled if pg_url is provided
        args = {
            "chat_id": "1",
            "user_input": "qué servicios tienen",
            "ai_intent": "pregunta_general",
            "ai_confidence": 0.9,
            "pg_url": "postgresql://test:test@localhost:5432/test",
            "current_state_name": "idle",
        }
        # This might fail if database connection fails, so we might need to mock run_rag_query
        from unittest.mock import AsyncMock, patch

        with patch("f.internal.conversational_router.main.run_rag_query", new_callable=AsyncMock) as mock_rag:
            mock_rag.return_value = {
                "count": 1,
                "entries": [{"title": "Servicios", "content": "Ofrecemos medicina general."}],
            }
            res = await main(args)
            data = res["data"]
            assert data["handled"] is True
            assert "medicina general" in data["response_text"]
            assert data["nextState"]["name"] == "información"
