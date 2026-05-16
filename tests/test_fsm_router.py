from __future__ import annotations

from typing import Any, ClassVar, cast
from unittest.mock import AsyncMock, patch

import pytest

from f.internal.fsm_router.main import _main_async as main


class TestTelegramRouter:
    """Unit tests for FSM Router."""

    @pytest.mark.asyncio
    async def test_router_no_flow_not_handled(self) -> None:
        # Arrange
        args: dict[str, Any] = {"chat_id": "123", "user_input": "Hola", "state": {"active_flow": None}}
        # Act
        res = await main(args)
        assert res is not None
        # Assert
        assert cast("dict[str, Any]", res["data"])["handled"] is False

    @pytest.mark.asyncio
    @patch("f.internal.fsm_router.main.apply_transition")
    async def test_router_active_flow_handled(self, mock_transition: AsyncMock) -> None:
        # Arrange
        args: dict[str, Any] = {
            "chat_id": "123",
            "user_input": "1",
            "state": {
                "active_flow": "booking",
                "booking_state": {"name": "selecting_specialty", "specialtyId": "s1", "specialtyName": "Test"},
                "booking_draft": {},
            },
        }

        # apply_transition returns Outcome directly
        mock_transition.return_value = {
            "nextState": AsyncMock(model_dump=lambda: {"name": "selecting_doctor"}),
            "responseText": "Selecciona doctor:",
            "advance": True,
        }

        # Act
        res = await main(args)
        assert res is not None

        # Assert
        assert cast("dict[str, Any]", res["data"])["handled"] is True
        assert cast("dict[str, Any]", res["data"])["response_text"] == "Selecciona doctor:"


class TestTelegramRouterStart:
    """Tests for /start command handler."""

    @pytest.mark.asyncio
    async def test_start_command_handled(self) -> None:
        """'/start' must always be handled regardless of current state."""
        args: dict[str, Any] = {"chat_id": "1", "user_input": "/start", "state": {}}
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True

    @pytest.mark.asyncio
    async def test_start_sets_idle_state(self) -> None:
        """/start must reset to idle state."""
        args: dict[str, Any] = {"chat_id": "1", "user_input": "/start", "state": {}}
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["nextState"] == {"name": "idle"}

    @pytest.mark.asyncio
    async def test_start_sets_booking_flow(self) -> None:
        """/start must activate the booking flow."""
        args: dict[str, Any] = {"chat_id": "1", "user_input": "/start", "state": {}}
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["active_flow"] == "booking"


class TestTelegramRouterMainMenu:
    """Tests for main menu disambiguation at idle state."""

    _IDLE_STATE: ClassVar[dict[str, Any]] = {
        "active_flow": "booking",
        "booking_state": {"name": "idle"},
        "booking_draft": {},
    }

    @pytest.mark.asyncio
    async def test_option_2_mis_citas_handled_if_required(self) -> None:
        """'2' at idle must be handled ONLY if requires_fsm_routing is True."""
        args: dict[str, Any] = {
            "chat_id": "1",
            "user_input": "2",
            "ai_intent": "mis_citas",
            "ai_confidence": 1.0,
            "state": self._IDLE_STATE,
            "requires_fsm_routing": True,
            "client_id": "c1",
            "pg_url": "postgresql://test:test@localhost:5432/test",
        }
        with patch("f.internal.fsm_router.main.get_mis_citas_text", new_callable=AsyncMock) as mock_query:
            mock_query.return_value = "Tus citas..."
            res = await main(args)
            data = cast("dict[str, Any]", res["data"])
            assert data["handled"] is True
            assert "Tus citas" in cast("str", data["response_text"])

    @pytest.mark.asyncio
    async def test_option_2_ignored_if_not_required(self) -> None:
        """'2' at idle must NOT be handled if requires_fsm_routing is False."""
        args: dict[str, Any] = {
            "chat_id": "1",
            "user_input": "2",
            "state": self._IDLE_STATE,
            "requires_fsm_routing": False,
        }
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is False

    @pytest.mark.asyncio
    async def test_option_1_passes_through_to_fsm_if_required(self) -> None:
        """'1' at idle must proceed to FSM ONLY if requires_fsm_routing is True."""
        args: dict[str, Any] = {
            "chat_id": "1",
            "user_input": "1",
            "ai_intent": "crear_cita",
            "ai_confidence": 1.0,
            "state": self._IDLE_STATE,
            "requires_fsm_routing": True,
            "items": [],
            "phone": "+34600000000",
        }
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True

    @pytest.mark.asyncio
    async def test_unrecognized_input_at_idle_ignored(self) -> None:
        """Unrecognized text at idle must NOT be handled (delegate to AI).."""
        args: dict[str, Any] = {
            "chat_id": "1",
            "user_input": "hola qué tal",
            "state": self._IDLE_STATE,
            "requires_fsm_routing": False,
        }
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is False

    @pytest.mark.asyncio
    async def test_menu_intercept_always_in_subflow(self) -> None:
        """'2' during specialty selection must ALWAYS be handled regardless of requires_fsm_routing."""
        args: dict[str, Any] = {
            "chat_id": "1",
            "user_input": "2",
            "state": {
                "active_flow": "booking",
                "booking_state": {
                    "name": "selecting_specialty",
                    "items": [
                        {"id": "sp1", "name": "Medicina General"},
                        {"id": "sp2", "name": "Cardiología"},
                    ],
                },
                "booking_draft": {},
            },
            "requires_fsm_routing": True,  # Will be true in real flow
        }
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        next_state = cast("dict[str, Any]", data["nextState"])
        assert next_state.get("name") != "idle"
