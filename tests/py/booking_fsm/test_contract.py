from f.internal.booking_fsm import (
    CompletedState,
    ConfirmingState,
    DraftBooking,
    IdleState,
    SelectingDoctorState,
    SelectingSpecialtyState,
    SelectingTimeState,
    apply_transition,
    parse_action,
)


def test_fsm_flow_success() -> None:
    draft = DraftBooking()

    # 1. Start: Idle -> Selecting Specialty
    state = IdleState()
    action = parse_action("agendar cita")  # Should map to 'select' if not a keyword
    # Actually parse_action maps "agendar cita" to select with value "agendar cita"
    # The handler expects items to be passed for idle -> selecting_specialty
    items = [{"id": "s1", "name": "Cardiología"}]

    err, result = apply_transition(state, {"type": "select", "value": "1"}, draft, items=items)
    assert err is None
    assert isinstance(result["nextState"], SelectingSpecialtyState)
    assert result["nextState"].items == items

    # 2. Select Specialty -> Selecting Doctor
    state = result["nextState"]
    action = {"type": "select", "value": "1"}  # Cardiología
    err, result = apply_transition(state, action, draft)
    assert err is None
    assert isinstance(result["nextState"], SelectingDoctorState)
    assert result["nextState"].specialtyId == "s1"

    # 3. Select Doctor -> Selecting Time
    state = result["nextState"]
    doctor_items = [{"id": "d1", "name": "Dr. House"}]
    action = {"type": "select", "value": "1"}
    err, result = apply_transition(state, action, draft, items=doctor_items)
    assert err is None
    assert isinstance(result["nextState"], SelectingTimeState)
    assert result["nextState"].doctorId == "d1"

    # 4. Select Time -> Confirming
    state = result["nextState"]
    time_items = [{"id": "t1", "label": "10:00", "start_time": "2026-05-01T10:00:00Z"}]
    action = {"type": "select", "value": "1"}
    err, result = apply_transition(state, action, draft, items=time_items)
    assert err is None
    assert isinstance(result["nextState"], ConfirmingState)
    assert result["nextState"].timeSlot == "10:00"

    # 5. Confirm -> Completed
    state = result["nextState"]
    # Draft is updated by apply_transition
    updated_draft = DraftBooking(**result["nextState"].draft.model_dump())
    action = {"type": "confirm_yes"}
    err, result = apply_transition(state, action, updated_draft)
    assert err is None
    assert isinstance(result["nextState"], CompletedState)


def test_fsm_back_navigation() -> None:
    draft = DraftBooking()
    state = SelectingDoctorState(specialtyId="s1", specialtyName="Cardiología", items=[])
    items = [{"id": "s1", "name": "Cardiología"}]

    action = {"type": "back"}
    err, result = apply_transition(state, action, draft, items=items)

    assert err is None
    assert isinstance(result["nextState"], SelectingSpecialtyState)
    assert result["nextState"].items == items
