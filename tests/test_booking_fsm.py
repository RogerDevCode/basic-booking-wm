from __future__ import annotations

from f.internal.booking_fsm._fsm_machine import apply_transition, parse_callback_data
from f.internal.booking_fsm._fsm_models import CancelAction, DraftBooking, IdleState, SelectAction


class TestBookingFSM:
    """Unit tests for Booking FSM core logic."""

    def test_parse_callback_data_select(self) -> None:
        # Arrange
        data = "slot:s1"
        # Act
        action = parse_callback_data(data)
        # Assert
        assert isinstance(action, SelectAction)
        assert action.value == "s1"

    def test_parse_callback_data_invalid(self) -> None:
        # Arrange
        data = "invalid-json"
        # Act
        action = parse_callback_data(data)
        # Assert
        assert action is None

    def test_apply_transition_cancel(self) -> None:
        # Arrange
        state = IdleState()
        action = CancelAction()
        draft = DraftBooking()
        # Act
        err, outcome = apply_transition(state, action, draft)
        # Assert
        assert err is None
        assert outcome is not None
        assert outcome["nextState"].name == "idle"
        assert "Menú Principal" in outcome["responseText"]

    def test_apply_transition_idle_to_selecting(self) -> None:
        # Arrange
        state = IdleState()
        action = SelectAction(value="1")
        draft = DraftBooking()
        items = [{"id": "s1", "name": "General"}]
        # Act
        err, outcome = apply_transition(state, action, draft, items=items)
        # Assert
        assert err is None
        assert outcome is not None
        assert outcome["nextState"].name == "selecting_specialty"
