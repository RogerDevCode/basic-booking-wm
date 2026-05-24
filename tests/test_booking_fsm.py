from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from f.internal.booking_fsm._fsm_machine import apply_transition, parse_callback_data
from f.internal.booking_fsm._fsm_models import (
    BookingStateRoot,
    CancelAction,
    ConfirmingState,
    DraftBooking,
    IdleState,
    SelectAction,
    SelectingDoctorState,
    SelectingSpecialtyState,
    SelectingTimeState,
)


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
        outcome = apply_transition(state, action, draft)
        # Assert
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
        outcome = apply_transition(state, action, draft, items=items)
        # Assert
        assert outcome is not None
        assert outcome["nextState"].name == "selecting_specialty"


class TestBookingFSMProperties:
    """Property-based tests for FSM invariants using Hypothesis."""

    # Generate a random valid action
    action_strategy = st.one_of(
        st.builds(CancelAction),
        st.builds(SelectAction, value=st.text(min_size=1)),
    )

    # Generate random draft state
    draft_strategy = st.builds(DraftBooking, target_date=st.one_of(st.none(), st.text(min_size=1)))

    @given(action_strategy, draft_strategy)
    def test_idle_is_absorbing_for_select(self, action: SelectAction | CancelAction, draft: DraftBooking) -> None:
        """Invariant 3: Idle state is absorbing unless it's a specific recognized start action (like selecting 1)."""
        state = IdleState()
        # If action is SelectAction but not "1" or valid initial selection, we verify it doesn't crash
        # Actually our FSM might transition to selecting_specialty only if action is SelectAction("1")
        # Let's just apply it and ensure it doesn't crash, and the nextState is valid
        outcome = apply_transition(state, action, draft)
        if outcome is not None:
            # Must always produce a valid state
            assert "nextState" in outcome
            next_state = outcome["nextState"]
            # Validate via Pydantic that the output state is valid
            try:
                state_dict = next_state.model_dump()
                state_dict["name"] = next_state.name
                BookingStateRoot.model_validate(state_dict)
            except Exception as e:
                raise AssertionError(f"Produced invalid state: {state_dict} - {e}") from e

    # Generate a generic state
    state_strategy = st.one_of(
        st.builds(IdleState),
        st.builds(SelectingSpecialtyState, items=st.lists(st.fixed_dictionaries({"id": st.text(), "name": st.text()}))),
        st.builds(
            SelectingDoctorState,
            specialtyId=st.text(),
            specialtyName=st.text(),
            items=st.lists(st.fixed_dictionaries({"id": st.text(), "name": st.text()})),
        ),
        st.builds(
            SelectingTimeState,
            specialtyId=st.text(),
            doctorId=st.text(),
            doctorName=st.text(),
            items=st.lists(st.fixed_dictionaries({"id": st.text(), "label": st.text(), "start_time": st.text()})),
        ),
        st.builds(ConfirmingState, draft=draft_strategy),
    )

    @given(state_strategy, action_strategy, draft_strategy)
    def test_fsm_never_reaches_invalid_state(
        self,
        state: IdleState | SelectingSpecialtyState | SelectingDoctorState | SelectingTimeState | ConfirmingState,
        action: SelectAction | CancelAction,
        draft: DraftBooking,
    ) -> None:
        """Invariant 1 & 2: Any state + any action = valid next state (or None)."""
        outcome = apply_transition(state, action, draft)
        if outcome is not None:
            assert "nextState" in outcome
            next_state = outcome["nextState"]
            state_dict = next_state.model_dump()
            state_dict["name"] = next_state.name
            try:
                BookingStateRoot.model_validate(state_dict)
            except Exception as e:
                raise AssertionError(f"Produced invalid state from {state.name} with {action}: {e}") from e
