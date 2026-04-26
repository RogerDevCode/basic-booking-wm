from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any, Final, TypeIs, cast

from pydantic import TypeAdapter

from .._date_resolver import resolve_date
from .._result import Result, fail, ok
from ._fsm_models import (
    BackAction,
    BookingAction,
    BookingState,
    BookingStateRoot,
    CancelAction,
    CompletedState,
    ConfirmingState,
    ConfirmNoAction,
    ConfirmYesAction,
    DraftBooking,
    DraftCore,
    IdleState,
    NamedItem,
    SelectAction,
    SelectDateAction,
    SelectingDoctorState,
    SelectingSpecialtyState,
    SelectingTimeState,
    TimeSlotItem,
    TransitionOutcome,
)
from ._fsm_responses import (
    build_confirmation_prompt,
    build_doctors_prompt,
    build_loading_doctors_prompt,
    build_loading_slots_prompt,
    build_slots_prompt,
    build_specialty_prompt,
)

if TYPE_CHECKING:
    pass

MAIN_MENU_TEXT: Final[str] = "📱 *Menú Principal*\n\n1️⃣ Agendar cita\n2️⃣ Mis citas\n3️⃣ Recordatorios\n4️⃣ Información"


def _is_named_item_list(val: list[NamedItem]) -> TypeIs[list[NamedItem]]:
    return all(isinstance(x, dict) and "id" in x and "name" in x for x in val)


def _is_time_slot_list(val: list[TimeSlotItem]) -> TypeIs[list[TimeSlotItem]]:
    return all(isinstance(x, dict) and "id" in x and "label" in x and "start_time" in x for x in val)


def parse_action(text: str) -> BookingAction:
    trimmed = text.strip().lower()

    if trimmed in ["volver", "back", "atras", "menu", "menú", "inicio"]:
        return BackAction()
    if trimmed in ["cancelar", "cancel", "no quiero"]:
        return CancelAction()
    if trimmed in ["si", "sí", "yes", "confirmar", "confirmo", "ok", "dale"]:
        return ConfirmYesAction()
    if trimmed in ["no", "nop", "nope"]:
        return ConfirmNoAction()

    if re.match(r"^\d+$", trimmed):
        return SelectAction(value=trimmed)

    parsed_date = resolve_date(trimmed)
    if parsed_date:
        return SelectDateAction(value=parsed_date)

    return SelectAction(value=trimmed)


def parse_callback_data(data: str) -> BookingAction | None:
    if data == "back":
        return BackAction()
    if data == "cancel":
        return CancelAction()
    if data == "cfm:yes":
        return ConfirmYesAction()
    if data == "cfm:no":
        return ConfirmNoAction()

    match = re.match(r"^(spec|doc|time|slot):(.+)$", data)
    if match:
        return SelectAction(value=match.group(2))

    return None


def apply_transition(
    current_state: BookingState, action: BookingAction | dict[str, Any], draft: DraftBooking, items: list[Any] | None = None
) -> Result[TransitionOutcome]:
    # 0. Ensure action is a Pydantic model
    if isinstance(action, dict):
        try:
            action = TypeAdapter(BookingAction).validate_python(action)
        except Exception as e:
            return fail(f"invalid_action_structure: {e}")

    # 1. Global Actions
    if action.type == "cancel":
        return ok(TransitionOutcome(nextState=IdleState(), responseText=MAIN_MENU_TEXT, advance=False))

    # 2. Step Handlers
    if isinstance(current_state, IdleState):
        if isinstance(action, SelectAction):
            raw_items = items if items is not None else []
            if _is_named_item_list(raw_items):
                return ok(
                    TransitionOutcome(
                        nextState=SelectingSpecialtyState(items=raw_items),
                        responseText=build_specialty_prompt(raw_items),
                        advance=True,
                    )
                )
            return fail("no_specialties_available")
        return fail("invalid_idle_action")

    elif isinstance(current_state, SelectingSpecialtyState):
        if isinstance(action, BackAction):
            return ok(TransitionOutcome(nextState=IdleState(), responseText=MAIN_MENU_TEXT, advance=False))

        if isinstance(action, SelectAction):
            specialty_items = current_state.items
            specialty = next((i for i in specialty_items if i["id"] == action.value), None)

            if not specialty and re.match(r"^\d+$", action.value):
                idx = int(action.value) - 1
                if 0 <= idx < len(specialty_items):
                    specialty = specialty_items[idx]

            if not specialty:
                return ok(
                    TransitionOutcome(
                        nextState=SelectingSpecialtyState(items=specialty_items, error="Opción inválida."),
                        responseText=build_specialty_prompt(specialty_items, "⚠️ Opción inválida."),
                        advance=False,
                    )
                )

            return ok(
                TransitionOutcome(
                    nextState=SelectingDoctorState(specialtyId=specialty["id"], specialtyName=specialty["name"], items=[]),
                    responseText=build_loading_doctors_prompt(specialty["name"]),
                    advance=True,
                )
            )

    elif isinstance(current_state, SelectingDoctorState):
        if isinstance(action, BackAction):
            raw_items = items if items is not None else []
            if _is_named_item_list(raw_items):
                return ok(
                    TransitionOutcome(
                        nextState=SelectingSpecialtyState(items=raw_items),
                        responseText=build_specialty_prompt(raw_items),
                        advance=False,
                    )
                )
            return fail("invalid_state_transition_no_items")

        if isinstance(action, SelectAction):
            doctor_items = current_state.items if current_state.items else (items if items is not None else [])
            if not _is_named_item_list(doctor_items):
                return fail("invalid_doctor_items")

            doctor = next((i for i in doctor_items if i["id"] == action.value), None)

            if not doctor and re.match(r"^\d+$", action.value):
                idx = int(action.value) - 1
                if 0 <= idx < len(doctor_items):
                    doctor = doctor_items[idx]

            if not doctor:
                return ok(
                    TransitionOutcome(
                        nextState=SelectingDoctorState(
                            specialtyId=current_state.specialtyId,
                            specialtyName=current_state.specialtyName,
                            items=doctor_items,
                            error="Opción inválida.",
                        ),
                        responseText=build_doctors_prompt(current_state.specialtyName, doctor_items, "⚠️ Opción inválida."),
                        advance=False,
                    )
                )

            return ok(
                TransitionOutcome(
                    nextState=SelectingTimeState(
                        specialtyId=current_state.specialtyId, doctorId=doctor["id"], doctorName=doctor["name"], items=[]
                    ),
                    responseText=build_loading_slots_prompt(doctor["name"]),
                    advance=True,
                )
            )

    elif isinstance(current_state, SelectingTimeState):
        if isinstance(action, BackAction):
            raw_items = items if items is not None else []
            if _is_named_item_list(raw_items):
                return ok(
                    TransitionOutcome(
                        nextState=SelectingDoctorState(
                            specialtyId=current_state.specialtyId,
                            specialtyName="",  # Will be filled by UI/Service
                            items=raw_items,
                        ),
                        responseText=build_doctors_prompt("", raw_items),
                        advance=False,
                    )
                )
            return fail("invalid_state_transition_no_items")

        if isinstance(action, SelectDateAction):
            return ok(
                TransitionOutcome(
                    nextState=SelectingTimeState(
                        specialtyId=current_state.specialtyId,
                        doctorId=current_state.doctorId,
                        doctorName=current_state.doctorName,
                        targetDate=action.value,
                        items=[],
                    ),
                    responseText=f"Buscando horarios para el {action.value}...",
                    advance=True,
                )
            )

        if isinstance(action, SelectAction):
            raw_items = items if items is not None else []
            time_items = current_state.items if current_state.items else raw_items

            if not _is_time_slot_list(time_items):
                return fail("invalid_time_items")

            slot = next((i for i in time_items if i["id"] == action.value or i["start_time"] == action.value), None)

            if not slot and re.match(r"^\d+$", action.value):
                idx = int(action.value) - 1
                if 0 <= idx < len(time_items):
                    slot = time_items[idx]

            if not slot:
                return ok(
                    TransitionOutcome(
                        nextState=SelectingTimeState(
                            specialtyId=current_state.specialtyId,
                            doctorId=current_state.doctorId,
                            doctorName=current_state.doctorName,
                            targetDate=current_state.targetDate,
                            items=time_items,
                            error="Opción inválida.",
                        ),
                        responseText=build_slots_prompt(current_state.doctorName, time_items, "⚠️ Opción inválida."),
                        advance=False,
                    )
                )

            new_draft = draft.model_copy()
            new_draft.specialty_id = current_state.specialtyId
            new_draft.doctor_id = current_state.doctorId
            new_draft.doctor_name = current_state.doctorName
            new_draft.start_time = slot["start_time"]
            new_draft.time_label = slot["label"]
            new_draft.target_date = current_state.targetDate

            # Transition to confirming
            return ok(
                TransitionOutcome(
                    nextState=ConfirmingState(
                        specialtyId=current_state.specialtyId,
                        doctorId=current_state.doctorId,
                        doctorName=current_state.doctorName,
                        timeSlot=slot["label"],
                        draft=DraftCore(
                            specialty_id=new_draft.specialty_id,
                            specialty_name=new_draft.specialty_name,
                            doctor_id=new_draft.doctor_id,
                            doctor_name=new_draft.doctor_name,
                            start_time=new_draft.start_time,
                            time_label=new_draft.time_label,
                            client_id=new_draft.client_id,
                        ),
                    ),
                    responseText=build_confirmation_prompt(slot["label"], current_state.doctorName),
                    advance=True,
                )
            )

    elif isinstance(current_state, ConfirmingState):
        if isinstance(action, ConfirmYesAction):
            return ok(
                TransitionOutcome(
                    nextState=CompletedState(bookingId="pending"),
                    responseText="✅ *Reserva Confirmada*\n\nTu cita ha sido agendada correctamente.\nRecibirás un recordatorio antes de tu cita.",
                    advance=True,
                )
            )

        if isinstance(action, (ConfirmNoAction, BackAction)):
            raw_items = items if items is not None else []
            if _is_time_slot_list(raw_items):
                return ok(
                    TransitionOutcome(
                        nextState=SelectingTimeState(
                            specialtyId=current_state.specialtyId,
                            doctorId=current_state.doctorId,
                            doctorName=current_state.doctorName,
                            targetDate=draft.target_date,
                            items=raw_items,
                        ),
                        responseText=build_slots_prompt(current_state.doctorName, raw_items),
                        advance=False,
                    )
                )
            return fail("invalid_state_transition_no_items")

    elif isinstance(current_state, CompletedState):
        return ok(TransitionOutcome(nextState=IdleState(), responseText=MAIN_MENU_TEXT, advance=False))

    return fail(f"unknown_state_or_action: {current_state.name}")


STEP_TO_FLOW_STEP: Final[dict[str, int]] = {
    "idle": 0,
    "selecting_specialty": 1,
    "selecting_doctor": 2,
    "selecting_time": 3,
    "confirming": 4,
    "completed": 5,
}


def flow_step_from_state(state: BookingState) -> int:
    return STEP_TO_FLOW_STEP.get(state.name, 0)
