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
        assert data["nextState"]["name"] == "idle"
        assert "session_id" in data["nextState"]

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
        with patch(
            "f.internal.fsm_router.handlers._wallet_handler.get_mis_citas_text", new_callable=AsyncMock
        ) as mock_query:
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


class TestTelegramRouterEscape:
    """Tests for early menu/abort escape logic from any state."""

    @pytest.mark.asyncio
    async def test_menu_keyword_escapes_active_booking(self) -> None:
        args: dict[str, Any] = {
            "chat_id": "1",
            "user_input": "ir al menu",
            "state": {
                "active_flow": "booking",
                "booking_state": {
                    "name": "selecting_specialty",
                    "items": [{"id": "sp1", "name": "Medicina General"}],
                },
                "booking_draft": {},
            },
        }
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"] == {"name": "idle"}
        assert data["nextDraft"] == {}
        assert "cancelado" in data["response_text"].lower()

    @pytest.mark.asyncio
    async def test_menu_keyword_escapes_registration(self) -> None:
        args: dict[str, Any] = {
            "chat_id": "1",
            "user_input": "menú",
            "state": {
                "active_flow": "booking",
                "booking_state": {
                    "name": "awaiting_phone",
                },
                "booking_draft": {},
            },
        }
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"] == {"name": "idle"}
        assert "cancelado" in data["response_text"].lower()

    @pytest.mark.asyncio
    async def test_menu_keyword_escapes_reminders_config(self) -> None:
        args: dict[str, Any] = {
            "chat_id": "1",
            "user_input": "volver al menu",
            "state": {
                "active_flow": "booking",
                "booking_state": {
                    "name": "reminders_config",
                },
                "booking_draft": {},
            },
        }
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"] == {"name": "idle"}
        assert "cancelado" in data["response_text"].lower()

    @pytest.mark.asyncio
    async def test_menu_intent_escapes_active_booking(self) -> None:
        args: dict[str, Any] = {
            "chat_id": "1",
            "user_input": "quiero ver las opciones principales",
            "ai_intent": "mostrar_menu_principal",
            "ai_confidence": 0.95,
            "state": {
                "active_flow": "booking",
                "booking_state": {
                    "name": "selecting_doctor",
                },
                "booking_draft": {},
            },
        }
        res = await main(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"] == {"name": "idle"}
        assert "cancelado" in data["response_text"].lower()


class TestTelegramRouterDateHandling:
    """Tests to verify target date extraction, propagation, and prefetch logic."""

    @pytest.mark.asyncio
    async def test_router_initial_intent_saves_target_date(self) -> None:
        # Arrange
        args: dict[str, Any] = {
            "chat_id": "123",
            "client_id": "c1",
            "user_input": "quiero hora para el 2026-05-27",
            "ai_intent": "crear_cita",
            "ai_confidence": 1.0,
            "ai_entities": {"date": "2026-05-27"},
            "state": {
                "active_flow": "booking",
                "booking_state": {"name": "idle"},
                "booking_draft": {},
            },
            "requires_fsm_routing": True,
            "items": [{"id": "spec1", "name": "Cardiología"}],
            "phone": "+34600000000",
        }

        # Act
        res = await main(args)
        assert res is not None
        data = cast("dict[str, Any]", res["data"])

        # Assert
        assert data["handled"] is True
        assert data["nextState"]["name"] == "selecting_specialty"
        assert data["nextDraft"].get("target_date") == "2026-05-27"

    @pytest.mark.asyncio
    async def test_fsm_machine_propagates_target_date(self) -> None:
        # Arrange
        from f.internal.booking_fsm._fsm_machine import apply_transition, extract_draft_from_state
        from f.internal.booking_fsm._fsm_models import (
            ConfirmingState,
            DraftBooking,
            SelectAction,
            SelectingDoctorState,
            SelectingTimeState,
        )

        current_state = SelectingDoctorState(
            specialtyId="s1",
            specialtyName="Cardiología",
            items=[{"id": "doc1", "name": "Carolina Muñoz Soto"}],
        )
        action = SelectAction(value="doc1")
        draft = DraftBooking(target_date="2026-05-27")
        time_slots = [{"id": "slot1", "label": "Mié 27 May · 10:00", "start_time": "2026-05-27T10:00:00Z"}]

        # Act
        outcome = apply_transition(current_state, action, draft, items=time_slots)

        # Assert
        next_state = outcome["nextState"]
        assert isinstance(next_state, SelectingTimeState)
        assert next_state.targetDate == "2026-05-27"

        # Act 2: Extract draft from SelectingDoctorState should preserve target_date
        extracted_doctor_draft = extract_draft_from_state(current_state, previous_draft=draft)
        assert extracted_doctor_draft.target_date == "2026-05-27"

        # Act 3: SelectingTimeState selecting slot -> ConfirmingState
        time_state = SelectingTimeState(
            specialtyId="s1",
            doctorId="doc1",
            doctorName="Carolina Muñoz Soto",
            targetDate="2026-05-27",
            items=[{"id": "slot1", "label": "Mié 27 May · 10:00", "start_time": "2026-05-27T10:00:00Z"}],
        )
        time_action = SelectAction(value="slot1")
        time_outcome = apply_transition(time_state, time_action, draft)

        # Assert 3
        confirming_state = time_outcome["nextState"]
        assert isinstance(confirming_state, ConfirmingState)
        assert confirming_state.draft.target_date == "2026-05-27"

        # Act 4: Extract draft from ConfirmingState
        extracted_confirming_draft = extract_draft_from_state(confirming_state)
        assert extracted_confirming_draft.target_date == "2026-05-27"

    @pytest.mark.asyncio
    async def test_cmd_agendar_redirects_to_selecting_specialty(self) -> None:
        """cmd:agendar callback must override any non-idle state and redirect to selecting_specialty."""
        # Arrange: User is in selecting_doctor state, but sends cmd:agendar callback
        args: dict[str, Any] = {
            "chat_id": "123",
            "user_input": "cmd:agendar|session123",
            "state": {
                "active_flow": "booking",
                "session_id": "session123",
                "booking_state": {
                    "name": "selecting_doctor",
                    "specialtyId": "s1",
                    "specialtyName": "Test",
                    "items": [],
                },
                "booking_draft": {"specialty_id": "s1", "specialty_name": "Test"},
            },
            "items": [{"id": "spec1", "name": "Cardiología"}],
            "requires_fsm_routing": True,
        }

        # Act
        res = await main(args)
        assert res is not None
        data = cast("dict[str, Any]", res["data"])

        # Assert
        assert data["handled"] is True
        assert data["nextState"]["name"] == "selecting_specialty"
        assert "Cardiología" in data["response_text"]
