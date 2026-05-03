from __future__ import annotations

from typing import Any, ClassVar, cast
from unittest.mock import AsyncMock, patch

import pytest

from f.internal.telegram_router.main import _main_async as main


class TestTelegramRouter:
    """Unit tests for Telegram Router."""

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
    @patch("f.internal.telegram_router.main.apply_transition")
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

        # apply_transition returns (Error, Outcome)
        mock_transition.return_value = (
            None,
            {
                "nextState": AsyncMock(model_dump=lambda: {"name": "selecting_doctor"}),
                "responseText": "Selecciona doctor:",
                "advance": True,
            },
        )

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

    @pytest.mark.asyncio
    async def test_start_response_contains_menu_options(self) -> None:
        """/start response must contain numbered menu options."""
        args: dict[str, Any] = {"chat_id": "1", "user_input": "/start", "state": {}}
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        text = cast("str", data["response_text"])
        # Must include all 4 main menu options
        assert "1" in text
        assert "2" in text
        assert "Agendar" in text or "agendar" in text


class TestTelegramRouterMainMenu:
    """Tests for main menu disambiguation at idle state."""

    _IDLE_STATE: ClassVar[dict[str, Any]] = {
        "active_flow": "booking",
        "booking_state": {"name": "idle"},
        "booking_draft": {},
    }

    @pytest.mark.asyncio
    async def test_option_2_mis_citas_handled(self) -> None:
        """'2' at idle must return 'Mis citas' response, not start booking flow."""
        args: dict[str, Any] = {"chat_id": "1", "user_input": "2", "state": self._IDLE_STATE}
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert "citas" in cast("str", data["response_text"]).lower()

    @pytest.mark.asyncio
    async def test_option_2_stays_at_idle(self) -> None:
        """'2' must not advance FSM — state stays idle."""
        args: dict[str, Any] = {"chat_id": "1", "user_input": "2", "state": self._IDLE_STATE}
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert cast("dict[str, Any]", data["nextState"])["name"] == "idle"

    @pytest.mark.asyncio
    async def test_mis_citas_keyword_handled(self) -> None:
        """'mis citas' text must also route to Mis Citas, not booking."""
        args: dict[str, Any] = {"chat_id": "1", "user_input": "mis citas", "state": self._IDLE_STATE}
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert cast("dict[str, Any]", data["nextState"])["name"] == "idle"

    @pytest.mark.asyncio
    async def test_consultar_keyword_handled(self) -> None:
        """'consultar' must route to Mis Citas, not booking flow."""
        args: dict[str, Any] = {"chat_id": "1", "user_input": "consultar", "state": self._IDLE_STATE}
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert cast("dict[str, Any]", data["nextState"])["name"] == "idle"

    @pytest.mark.asyncio
    async def test_option_3_recordatorios_handled(self) -> None:
        """'3' at idle must return reminders response, not booking."""
        args: dict[str, Any] = {"chat_id": "1", "user_input": "3", "state": self._IDLE_STATE}
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert cast("dict[str, Any]", data["nextState"])["name"] == "idle"

    @pytest.mark.asyncio
    async def test_option_4_info_handled(self) -> None:
        """'4' at idle must return info response, not booking."""
        args: dict[str, Any] = {"chat_id": "1", "user_input": "4", "state": self._IDLE_STATE}
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert cast("dict[str, Any]", data["nextState"])["name"] == "idle"

    @pytest.mark.asyncio
    async def test_option_2_does_not_start_specialty_selection(self) -> None:
        """'2' at idle must NOT enter selecting_specialty state."""
        args: dict[str, Any] = {"chat_id": "1", "user_input": "2", "state": self._IDLE_STATE}
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        next_state = cast("dict[str, Any]", data["nextState"])
        assert next_state.get("name") != "selecting_specialty"

    @pytest.mark.asyncio
    async def test_option_1_passes_through_to_fsm(self) -> None:
        """'1' at idle must proceed to FSM (agendar flow — returns specialty selection or loading)."""
        args: dict[str, Any] = {
            "chat_id": "1",
            "user_input": "1",
            "state": self._IDLE_STATE,
            "items": [],
        }
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True

    @pytest.mark.asyncio
    async def test_agendar_keyword_passes_to_fsm(self) -> None:
        """'agendar' at idle must also pass to FSM, not trigger invalid option."""
        args: dict[str, Any] = {
            "chat_id": "1",
            "user_input": "agendar",
            "state": self._IDLE_STATE,
            "items": [],
        }
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        # State should NOT remain idle — FSM tried to advance
        next_state = cast("dict[str, Any]", data.get("nextState") or {})
        assert next_state.get("name") != "idle"

    @pytest.mark.asyncio
    async def test_unrecognized_input_at_idle_returns_invalid_message(self) -> None:
        """Unrecognized text at idle must show 'invalid option' + main menu."""
        args: dict[str, Any] = {"chat_id": "1", "user_input": "hola qué tal", "state": self._IDLE_STATE}
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        text = cast("str", data["response_text"])
        assert "no entendí" in text.lower() or "opción" in text.lower() or "no" in text.lower()

    @pytest.mark.asyncio
    async def test_unrecognized_stays_at_idle(self) -> None:
        """Unrecognized text must NOT advance FSM — state remains idle."""
        args: dict[str, Any] = {"chat_id": "1", "user_input": "xyzabc", "state": self._IDLE_STATE}
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert cast("dict[str, Any]", data["nextState"])["name"] == "idle"

    @pytest.mark.asyncio
    async def test_numeric_5_is_invalid_at_idle(self) -> None:
        """'5' is not a valid menu option — must return invalid message, not FSM."""
        args: dict[str, Any] = {"chat_id": "1", "user_input": "5", "state": self._IDLE_STATE}
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert cast("dict[str, Any]", data["nextState"])["name"] == "idle"

    @pytest.mark.asyncio
    async def test_menu_intercept_only_at_idle_not_in_subflow(self) -> None:
        """'2' during specialty selection must be treated as specialty #2, not Mis Citas."""
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
        }
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        # Must enter doctor selection (or loading), NOT Mis Citas
        assert data["handled"] is True
        next_state = cast("dict[str, Any]", data["nextState"])
        assert next_state.get("name") != "idle"
