from typing import Any
import re
from typing import Optional, List, Dict, Any, cast, Tuple
from .._result import Result, ok, fail
from ._fsm_models import (
    BookingState, BookingAction, DraftBooking, TransitionOutcome,
    IdleState, SelectingSpecialtyState, SelectingDoctorState,
    SelectingTimeState, ConfirmingState, CompletedState,
    NamedItem, TimeSlotItem, DraftCore
)
from ._fsm_responses import (
    build_specialty_prompt, build_doctors_prompt, build_slots_prompt,
    build_confirmation_prompt, build_loading_doctors_prompt, build_loading_slots_prompt
)
from .._date_resolver import resolve_date

MAIN_MENU_TEXT = '📱 *Menú Principal*\n\n1️⃣ Agendar cita\n2️⃣ Mis citas\n3️⃣ Recordatorios\n4️⃣ Información'

def parse_action(text: str) -> BookingAction:
    trimmed = text.strip().lower()

    if trimmed in ['volver', 'back', 'atras', 'menu', 'menú', 'inicio']:
        return cast(BookingAction, {"type": "back"})
    if trimmed in ['cancelar', 'cancel', 'no quiero']:
        return cast(BookingAction, {"type": "cancel"})
    if trimmed in ['si', 'sí', 'yes', 'confirmar', 'confirmo', 'ok', 'dale']:
        return cast(BookingAction, {"type": "confirm_yes"})
    if trimmed in ['no', 'nop', 'nope']:
        return cast(BookingAction, {"type": "confirm_no"})
    
    if re.match(r"^\d+$", trimmed):
        return cast(BookingAction, {"type": "select", "value": trimmed})

    parsed_date = resolve_date(trimmed)
    if parsed_date:
        return cast(BookingAction, {"type": "select_date", "value": parsed_date})

    return cast(BookingAction, {"type": "select", "value": trimmed})

def parse_callback_data(data: str) -> Optional[BookingAction]:
    if data == 'back': return {"type": "back"}
    if data == 'cancel': return {"type": "cancel"}
    if data == 'cfm:yes': return {"type": "confirm_yes"}
    if data == 'cfm:no': return {"type": "confirm_no"}

    match = re.match(r"^(spec|doc|time|slot):(.+)$", data)
    if match:
        return {"type": "select", "value": match.group(2)}

    return None

def apply_transition(
    current_state: BookingState,
    action: BookingAction,
    draft: DraftBooking,
    items: Optional[List[Any]] = None
) -> Result[TransitionOutcome]:
    
    # 1. Global Actions
    if action["type"] == 'cancel':
        return ok({
            "nextState": IdleState(),
            "responseText": MAIN_MENU_TEXT,
            "advance": False
        })

    # 2. Step Handlers
    state_name = current_state.name

    if state_name == 'idle':
        if action["type"] == 'select':
            specialty_items = cast(List[NamedItem], items or [])
            if not specialty_items:
                return fail("no_specialties_available")
            
            return ok({
                "nextState": SelectingSpecialtyState(items=specialty_items),
                "responseText": build_specialty_prompt(specialty_items),
                "advance": True
            })
        return fail("invalid_idle_action")

    elif state_name == 'selecting_specialty':
        state = cast(SelectingSpecialtyState, current_state)
        if action["type"] == 'back':
            return ok({"nextState": IdleState(), "responseText": MAIN_MENU_TEXT, "advance": False})
        
        if action["type"] == 'select':
            specialty_items = state.items
            specialty = next((i for i in specialty_items if i["id"] == action["value"]), None)
            
            if not specialty and re.match(r"^\d+$", action["value"]):
                idx = int(action["value"]) - 1
                if 0 <= idx < len(specialty_items):
                    specialty = specialty_items[idx]

            if not specialty:
                return ok({
                    "nextState": SelectingSpecialtyState(items=specialty_items, error="Opción inválida."),
                    "responseText": build_specialty_prompt(specialty_items, "⚠️ Opción inválida."),
                    "advance": False
                })
            
            return ok({
                "nextState": SelectingDoctorState(specialtyId=specialty["id"], specialtyName=specialty["name"], items=[]),
                "responseText": build_loading_doctors_prompt(specialty["name"]),
                "advance": True
            })

    elif state_name == 'selecting_doctor':
        state = cast(SelectingDoctorState, current_state)
        if action["type"] == 'back':
            specialty_items = cast(List[NamedItem], items or [])
            return ok({
                "nextState": SelectingSpecialtyState(items=specialty_items),
                "responseText": build_specialty_prompt(specialty_items),
                "advance": False
            })

        if action["type"] == 'select':
            doctor_items = state.items if state.items else cast(List[NamedItem], items or [])
            doctor = next((i for i in doctor_items if i["id"] == action["value"]), None)

            if not doctor and re.match(r"^\d+$", action["value"]):
                idx = int(action["value"]) - 1
                if 0 <= idx < len(doctor_items):
                    doctor = doctor_items[idx]

            if not doctor:
                return ok({
                    "nextState": SelectingDoctorState(
                        specialtyId=state.specialtyId, 
                        specialtyName=state.specialtyName, 
                        items=doctor_items, 
                        error="Opción inválida."
                    ),
                    "responseText": build_doctors_prompt(state.specialtyName, doctor_items, "⚠️ Opción inválida."),
                    "advance": False
                })
            
            return ok({
                "nextState": SelectingTimeState(
                    specialtyId=state.specialtyId,
                    doctorId=doctor["id"],
                    doctorName=doctor["name"],
                    items=[]
                ),
                "responseText": build_loading_slots_prompt(doctor["name"]),
                "advance": True
            })

    elif state_name == 'selecting_time':
        state = cast(SelectingTimeState, current_state)
        if action["type"] == 'back':
            doctor_items = cast(List[NamedItem], items or [])
            return ok({
                "nextState": SelectingDoctorState(
                    specialtyId=state.specialtyId,
                    specialtyName="", # Will be filled by UI/Service
                    items=doctor_items
                ),
                "responseText": build_doctors_prompt("", doctor_items),
                "advance": False
            })

        if action["type"] == 'select_date':
            return ok({
                "nextState": SelectingTimeState(
                    specialtyId=state.specialtyId,
                    doctorId=state.doctorId,
                    doctorName=state.doctorName,
                    targetDate=action["value"],
                    items=[]
                ),
                "responseText": f"Buscando horarios para el {action['value']}...",
                "advance": True
            })

        if action["type"] == 'select':
            time_items = state.items if state.items else cast(List[TimeSlotItem], items or [])
            slot = next((i for i in time_items if i["start_time"] == action["value"]), None)

            if not slot and re.match(r"^\d+$", action["value"]):
                idx = int(action["value"]) - 1
                if 0 <= idx < len(time_items):
                    slot = time_items[idx]

            if not slot:
                return ok({
                    "nextState": SelectingTimeState(
                        specialtyId=state.specialtyId,
                        doctorId=state.doctorId,
                        doctorName=state.doctorName,
                        targetDate=state.targetDate,
                        items=time_items,
                        error="Opción inválida."
                    ),
                    "responseText": build_slots_prompt(state.doctorName, time_items, "⚠️ Opción inválida."),
                    "advance": False
                })

            new_draft = draft.model_copy(update={
                "specialty_id": state.specialtyId,
                "doctor_id": state.doctorId,
                "doctor_name": state.doctorName,
                "start_time": slot["start_time"],
                "time_label": slot["label"],
                "target_date": state.targetDate
            })

            # Transition to confirming
            return ok({
                "nextState": ConfirmingState(
                    specialtyId=state.specialtyId,
                    doctorId=state.doctorId,
                    doctorName=state.doctorName,
                    timeSlot=slot["label"],
                    draft=DraftCore(**new_draft.model_dump(include={
                        "specialty_id", "specialty_name", "doctor_id", "doctor_name", 
                        "start_time", "time_label", "client_id"
                    }))
                ),
                "responseText": build_confirmation_prompt(slot["label"], state.doctorName),
                "advance": True
            })

    elif state_name == 'confirming':
        state = cast(ConfirmingState, current_state)
        if action["type"] == 'confirm_yes':
            return ok({
                "nextState": CompletedState(bookingId="pending"),
                "responseText": '✅ *Reserva Confirmada*\n\nTu cita ha sido agendada correctamente.\nRecibirás un recordatorio antes de tu cita.',
                "advance": True
            })

        if action["type"] in ['confirm_no', 'back']:
            time_items = cast(List[TimeSlotItem], items or [])
            return ok({
                "nextState": SelectingTimeState(
                    specialtyId=state.specialtyId,
                    doctorId=state.doctorId,
                    doctorName=state.doctorName,
                    targetDate=draft.target_date,
                    items=time_items
                ),
                "responseText": build_slots_prompt(state.doctorName, time_items),
                "advance": False
            })

    elif state_name == 'completed':
        return ok({
            "nextState": IdleState(),
            "responseText": MAIN_MENU_TEXT,
            "advance": False
        })

    return fail(f"unknown_state_or_action: {state_name}")

STEP_TO_FLOW_STEP = {
    'idle': 0,
    'selecting_specialty': 1,
    'selecting_doctor': 2,
    'selecting_time': 3,
    'confirming': 4,
    'completed': 5,
}

def flow_step_from_state(state: BookingState) -> int:
    return STEP_TO_FLOW_STEP.get(state.name, 0)
