from __future__ import annotations

import re
from typing import Any, Final, cast

try:
    from typing import TypeIs
except ImportError:
    from typing import TypeIs

from pydantic import TypeAdapter

from .._date_resolver import resolve_date
from .._nlu_cache import get_nlu_rule
from ._fsm_models import (
    BackAction,
    BookingAction,
    BookingState,
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
    build_confirmation_keyboard,
    build_confirmation_prompt,
    build_doctor_keyboard,
    build_doctors_prompt,
    build_loading_doctors_prompt,
    build_loading_slots_prompt,
    build_slots_prompt,
    build_specialty_keyboard,
    build_specialty_prompt,
    build_time_slot_keyboard,
)


def get_main_menu_text() -> str:
    default_text = (
        "📱 *Menú Principal*\n\n"
        "1. 📅 Agendar hora\n"
        "2. 📋 Mis horas\n"
        "3. 📊 Generar reporte\n"
        "4. ⏰ Recordatorios\n"
        "5. ℹ️ Información\n"
        "6. 👤 Mis datos"
    )
    return str(get_nlu_rule("msg_main_menu", default_text))

def get_main_menu_inline_buttons() -> list[list[dict[str, str]]]:
    return [
        [{"text": "📅 Agendar hora", "callback_data": "cmd:agendar"}],
        [{"text": "📋 Mis horas", "callback_data": "cmd:mis_citas"}],
        [{"text": "📊 Generar reporte", "callback_data": "cmd:reporte"}],
        [{"text": "⏰ Recordatorios", "callback_data": "cmd:recordatorios"}],
        [{"text": "ℹ️ Información", "callback_data": "cmd:info"}],  # noqa: RUF001
        [{"text": "👤 Mis datos", "callback_data": "cmd:perfil"}],
    ]


def _is_named_item_list(val: list[Any]) -> TypeIs[list[NamedItem]]:
    return all(isinstance(x, dict) and "id" in x and "name" in x for x in val)


def _is_time_slot_list(val: list[Any]) -> TypeIs[list[TimeSlotItem]]:
    return all(isinstance(x, dict) and "id" in x and "label" in x and "start_time" in x for x in val)


def parse_action(text: str, timezone: str | None = None) -> BookingAction:
    trimmed = text.strip().lower()

    if trimmed in ["volver", "back", "atras", "menu", "menú", "inicio"]:
        return BackAction()
    if trimmed in [
        "cancelar",
        "cancel",
        "no quiero",
        "abandono",
        "aborto",
        "salir",
        "dejar",
        "parar",
        "terminar",
        "basta",
        "no mas",
        "no más",
        "desistir",
        "me voy",
        "me rindo",
    ]:
        return CancelAction()
    if trimmed in ["s", "y", "si", "sí", "yes", "confirmar", "confirmo", "ok", "dale"]:
        return ConfirmYesAction()
    if trimmed in ["n", "no", "nop", "nope"]:
        return ConfirmNoAction()

    if re.match(r"^\d+$", trimmed):
        return SelectAction(value=trimmed)

    # Only attempt date parsing if timezone is provided
    if timezone:
        try:
            parsed_date = resolve_date(trimmed, {"timezone": timezone})
            if parsed_date:
                return SelectDateAction(value=parsed_date)
        except ValueError:
            pass

    return SelectAction(value=trimmed)


def parse_callback_data(data: str) -> BookingAction | None:
    # Remove session suffix if present (format: action|session_id)
    raw_data = data
    if "|" in data:
        raw_data = data.split("|")[0]

    if raw_data == "back":
        return BackAction()
    if raw_data == "cancel":
        return CancelAction()
    if raw_data == "cfm:yes":
        return ConfirmYesAction()
    if raw_data == "cfm:no":
        return ConfirmNoAction()

    # Legacy numeric or direct selection
    if raw_data == "agendar":
        return SelectAction(value="1")

    # Command prefix (from main menu or rebooking)
    if raw_data.startswith("cmd:"):
        val = raw_data[4:]
        # Map some commands to numeric selection for the idle->selecting_specialty transition
        if val == "agendar":
            return SelectAction(value="1")
        return SelectAction(value=val)

    match = re.match(r"^(spec|doc|time|slot):(.+)$", raw_data)
    if match:
        return SelectAction(value=match.group(2))

    return None


def apply_transition(
    current_state: BookingState,
    action: BookingAction | dict[str, Any],
    draft: DraftBooking,
    items: list[Any] | None = None,
) -> TransitionOutcome:
    # 0. Ensure action is a Pydantic model
    if isinstance(action, dict):
        try:
            action = cast("BookingAction", TypeAdapter(BookingAction).validate_python(action))
        except Exception as e:
            raise RuntimeError(f"invalid_action_structure: {e}") from e

    # 1. Global Actions
    if isinstance(action, CancelAction):
        return TransitionOutcome(
            nextState=IdleState(session_id=current_state.session_id),
            responseText=get_main_menu_text(),
            advance=False,
        )

    # 2. Step Handlers
    if isinstance(current_state, IdleState):
        if isinstance(action, SelectAction):
            raw_items = items if items is not None else []
            if _is_named_item_list(raw_items):
                return TransitionOutcome(
                    nextState=SelectingSpecialtyState(items=raw_items, session_id=current_state.session_id),
                    responseText=build_specialty_prompt(raw_items),
                    advance=True,
                    inlineButtons=build_specialty_keyboard(raw_items, session_id=current_state.session_id),
                )
            raise RuntimeError("no_specialties_available")
        raise RuntimeError("invalid_idle_action")

    elif isinstance(current_state, SelectingSpecialtyState):
        if isinstance(action, BackAction):
            return TransitionOutcome(
                nextState=IdleState(session_id=current_state.session_id), responseText=get_main_menu_text(), advance=False
            )

        if isinstance(action, SelectAction):
            specialty_items = current_state.items
            specialty = next((i for i in specialty_items if i["id"] == action.value), None)

            if not specialty and re.match(r"^\d+$", action.value):
                idx = int(action.value) - 1
                if 0 <= idx < len(specialty_items):
                    specialty = specialty_items[idx]

            if not specialty:
                attempts = current_state.invalid_attempts + 1
                if attempts >= 3:
                    return TransitionOutcome(
                        nextState=IdleState(session_id=current_state.session_id),
                        responseText="❌ Demasiados intentos inválidos. Volviendo al menú principal.\n\n"
                        + get_main_menu_text(),
                        advance=False,
                    )
                return TransitionOutcome(
                    nextState=SelectingSpecialtyState(
                        items=specialty_items,
                        error="Opción inválida.",
                        invalid_attempts=attempts,
                        session_id=current_state.session_id,
                    ),
                    responseText=build_specialty_prompt(specialty_items, "⚠️ Opción inválida."),
                    advance=False,
                    inlineButtons=build_specialty_keyboard(specialty_items, session_id=current_state.session_id),
                )

            doctor_items = items if items is not None else []
            if _is_named_item_list(doctor_items) and doctor_items:
                return TransitionOutcome(
                    nextState=SelectingDoctorState(
                        specialtyId=specialty["id"],
                        specialtyName=specialty["name"],
                        items=doctor_items,
                        session_id=current_state.session_id,
                    ),
                    responseText=build_doctors_prompt(specialty["name"], doctor_items),
                    advance=True,
                    inlineButtons=build_doctor_keyboard(doctor_items, session_id=current_state.session_id),
                )
            return TransitionOutcome(
                nextState=SelectingDoctorState(
                    specialtyId=specialty["id"],
                    specialtyName=specialty["name"],
                    items=[],
                    session_id=current_state.session_id,
                ),
                responseText=build_loading_doctors_prompt(specialty["name"]),
                advance=True,
            )

    elif isinstance(current_state, SelectingDoctorState):
        if isinstance(action, BackAction):
            raw_items = items if items is not None else []
            if _is_named_item_list(raw_items):
                return TransitionOutcome(
                    nextState=SelectingSpecialtyState(items=raw_items, session_id=current_state.session_id),
                    responseText=build_specialty_prompt(raw_items),
                    advance=False,
                    inlineButtons=build_specialty_keyboard(raw_items, session_id=current_state.session_id),
                )
            raise RuntimeError("invalid_state_transition_no_items")

        if isinstance(action, SelectAction):
            doctor_items = current_state.items if current_state.items else (items if items is not None else [])
            if not _is_named_item_list(doctor_items):
                raise RuntimeError("invalid_doctor_items")

            doctor = next((i for i in doctor_items if i["id"] == action.value), None)

            if not doctor and re.match(r"^\d+$", action.value):
                idx = int(action.value) - 1
                if 0 <= idx < len(doctor_items):
                    doctor = doctor_items[idx]

            if not doctor:
                attempts = current_state.invalid_attempts + 1
                if attempts >= 3:
                    return TransitionOutcome(
                        nextState=IdleState(session_id=current_state.session_id),
                        responseText="❌ Demasiados intentos inválidos. Volviendo al menú principal.\n\n"
                        + get_main_menu_text(),
                        advance=False,
                    )
                return TransitionOutcome(
                    nextState=SelectingDoctorState(
                        specialtyId=current_state.specialtyId,
                        specialtyName=current_state.specialtyName,
                        items=doctor_items,
                        error="Opción inválida.",
                        invalid_attempts=attempts,
                        session_id=current_state.session_id,
                    ),
                    responseText=build_doctors_prompt(current_state.specialtyName, doctor_items, "⚠️ Opción inválida."),
                    advance=False,
                    inlineButtons=build_doctor_keyboard(doctor_items, session_id=current_state.session_id),
                )

            time_items = items if items is not None else []
            if _is_time_slot_list(time_items) and time_items:
                return TransitionOutcome(
                    nextState=SelectingTimeState(
                        specialtyId=current_state.specialtyId,
                        doctorId=doctor["id"],
                        doctorName=doctor["name"],
                        targetDate=draft.target_date,
                        items=time_items,
                        session_id=current_state.session_id,
                    ),
                    responseText=build_slots_prompt(doctor["name"], time_items),
                    advance=True,
                    inlineButtons=build_time_slot_keyboard(time_items, session_id=current_state.session_id),
                )
            return TransitionOutcome(
                nextState=SelectingTimeState(
                    specialtyId=current_state.specialtyId,
                    doctorId=doctor["id"],
                    doctorName=doctor["name"],
                    targetDate=draft.target_date,
                    items=[],
                    session_id=current_state.session_id,
                ),
                responseText=build_loading_slots_prompt(doctor["name"]),
                advance=True,
            )

    elif isinstance(current_state, SelectingTimeState):
        if isinstance(action, BackAction):
            raw_items = items if items is not None else []
            if _is_named_item_list(raw_items):
                return TransitionOutcome(
                    nextState=SelectingDoctorState(
                        specialtyId=current_state.specialtyId,
                        specialtyName="",  # Will be filled by UI/Service
                        items=raw_items,
                        session_id=current_state.session_id,
                    ),
                    responseText=build_doctors_prompt("", raw_items),
                    advance=False,
                    inlineButtons=build_doctor_keyboard(raw_items, session_id=current_state.session_id),
                )
            raise RuntimeError("invalid_state_transition_no_items")

        if isinstance(action, SelectDateAction):
            return TransitionOutcome(
                nextState=SelectingTimeState(
                    specialtyId=current_state.specialtyId,
                    doctorId=current_state.doctorId,
                    doctorName=current_state.doctorName,
                    targetDate=action.value,
                    items=[],
                    session_id=current_state.session_id,
                ),
                responseText=f"Buscando horarios para el {action.value}...",
                advance=True,
            )

        if isinstance(action, SelectAction):
            raw_items = items if items is not None else []
            time_items = current_state.items if current_state.items else raw_items

            if not _is_time_slot_list(time_items):
                raise RuntimeError("invalid_time_items")

            slot = next((i for i in time_items if i["id"] == action.value or i["start_time"] == action.value), None)

            if not slot and re.match(r"^\d+$", action.value):
                idx = int(action.value) - 1
                if 0 <= idx < len(time_items):
                    slot = time_items[idx]

            if not slot:
                attempts = current_state.invalid_attempts + 1
                if attempts >= 3:
                    return TransitionOutcome(
                        nextState=IdleState(session_id=current_state.session_id),
                        responseText="❌ Demasiados intentos inválidos. Volviendo al menú principal.\n\n"
                        + get_main_menu_text(),
                        advance=False,
                    )
                return TransitionOutcome(
                    nextState=SelectingTimeState(
                        specialtyId=current_state.specialtyId,
                        doctorId=current_state.doctorId,
                        doctorName=current_state.doctorName,
                        targetDate=current_state.targetDate,
                        items=time_items,
                        error="Opción inválida.",
                        invalid_attempts=attempts,
                        session_id=current_state.session_id,
                    ),
                    responseText=build_slots_prompt(current_state.doctorName, time_items, "⚠️ Opción inválida."),
                    advance=False,
                    inlineButtons=build_time_slot_keyboard(time_items, session_id=current_state.session_id),
                )

            new_draft = draft.model_copy()
            new_draft.specialty_id = current_state.specialtyId
            new_draft.doctor_id = current_state.doctorId
            new_draft.doctor_name = current_state.doctorName
            new_draft.start_time = slot["start_time"]
            new_draft.time_label = slot["label"]
            new_draft.target_date = current_state.targetDate

            # Transition to confirming
            return TransitionOutcome(
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
                        target_date=new_draft.target_date,
                    ),
                    session_id=current_state.session_id,
                ),
                responseText=build_confirmation_prompt(slot["label"], current_state.doctorName),
                advance=True,
                inlineButtons=build_confirmation_keyboard(session_id=current_state.session_id),
            )

    elif isinstance(current_state, ConfirmingState):
        if isinstance(action, ConfirmYesAction):
            return TransitionOutcome(
                nextState=IdleState(session_id=current_state.session_id),
                responseText="⏳ Procesando tu reserva...",
                advance=True,
            )

        if isinstance(action, ConfirmNoAction | BackAction):
            raw_items = items if items is not None else []
            if _is_time_slot_list(raw_items):
                return TransitionOutcome(
                    nextState=SelectingTimeState(
                        specialtyId=current_state.specialtyId,
                        doctorId=current_state.doctorId,
                        doctorName=current_state.doctorName,
                        targetDate=draft.target_date,
                        items=raw_items,
                        session_id=current_state.session_id,
                    ),
                    responseText=build_slots_prompt(current_state.doctorName, raw_items),
                    advance=False,
                    inlineButtons=build_time_slot_keyboard(raw_items, session_id=current_state.session_id),
                )
            raise RuntimeError("invalid_state_transition_no_items")

        if isinstance(action, SelectAction):
            if action.value == "1":
                return TransitionOutcome(
                    nextState=IdleState(session_id=current_state.session_id),
                    responseText="⏳ Procesando tu reserva...",
                    advance=True,
                )
            if action.value == "2":
                raw_items = items if items is not None else []
                if _is_time_slot_list(raw_items):
                    return TransitionOutcome(
                        nextState=SelectingTimeState(
                            specialtyId=current_state.specialtyId,
                            doctorId=current_state.doctorId,
                            doctorName=current_state.doctorName,
                            targetDate=draft.target_date,
                            items=raw_items,
                            session_id=current_state.session_id,
                        ),
                        responseText=build_slots_prompt(current_state.doctorName, raw_items),
                        advance=False,
                        inlineButtons=build_time_slot_keyboard(raw_items, session_id=current_state.session_id),
                    )
            attempts = getattr(current_state, "invalid_attempts", 0) + 1
            if attempts >= 3:
                return TransitionOutcome(
                    nextState=IdleState(session_id=current_state.session_id),
                    responseText="❌ Demasiados intentos inválidos. Volviendo al menú principal.\n\n"
                    + get_main_menu_text(),
                    advance=False,
                )

            return TransitionOutcome(
                nextState=ConfirmingState(
                    specialtyId=current_state.specialtyId,
                    doctorId=current_state.doctorId,
                    doctorName=current_state.doctorName,
                    timeSlot=current_state.timeSlot,
                    draft=current_state.draft,
                    invalid_attempts=attempts,
                    session_id=current_state.session_id,
                ),
                responseText=build_confirmation_prompt(current_state.timeSlot, current_state.doctorName),
                advance=False,
                inlineButtons=build_confirmation_keyboard(session_id=current_state.session_id),
            )

    if True:  # patched unnecessary isinstance
        return TransitionOutcome(
            nextState=IdleState(session_id=current_state.session_id),
            responseText=get_main_menu_text(),
            advance=False,
            inlineButtons=get_main_menu_inline_buttons(),
        )

    raise RuntimeError(f"unknown_state_or_action: {current_state.name}")


STEP_TO_FLOW_STEP: Final[dict[str, int]] = {
    "idle": 0,
    "selecting_specialty": 1,
    "selecting_doctor": 2,
    "selecting_time": 3,
    "confirming": 4,
    "completed": 5,
}


def extract_draft_from_state(state: BookingState, previous_draft: DraftBooking | None = None) -> DraftBooking:
    """Extract accumulated draft data from a booking state."""
    target_date = previous_draft.target_date if previous_draft else None

    if isinstance(state, ConfirmingState):
        return DraftBooking(
            specialty_id=state.draft.specialty_id,
            specialty_name=state.draft.specialty_name,
            doctor_id=state.draft.doctor_id,
            doctor_name=state.draft.doctor_name,
            start_time=state.draft.start_time,
            time_label=state.draft.time_label,
            client_id=state.draft.client_id,
            target_date=state.draft.target_date or target_date,
        )
    if isinstance(state, SelectingTimeState):
        return DraftBooking(
            specialty_id=state.specialtyId,
            doctor_id=state.doctorId,
            doctor_name=state.doctorName,
            target_date=state.targetDate or target_date,
        )
    if isinstance(state, SelectingDoctorState):
        return DraftBooking(
            specialty_id=state.specialtyId,
            specialty_name=state.specialtyName,
            target_date=target_date,
        )
    if isinstance(state, SelectingSpecialtyState):
        return DraftBooking(
            target_date=target_date,
        )
    if isinstance(state, CompletedState):
        return DraftBooking(last_state_name="completed")
    return DraftBooking(target_date=target_date)


def flow_step_from_state(state: BookingState) -> int:
    return STEP_TO_FLOW_STEP.get(state.name, 0)
