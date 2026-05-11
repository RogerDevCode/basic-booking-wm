from __future__ import annotations

import re
from typing import Any

try:
    from typing import TypeIs
except ImportError:
    from typing import TypeIs


from .models import (
    BackAction,
    BookingAction,
    BookingState,
    CancelAction,
    ConfirmingState,
    ConfirmNoAction,
    ConfirmYesAction,
    DraftBooking,
    DraftCore,
    IdleState,
    SelectAction,
    SelectingDoctorState,
    SelectingSpecialtyState,
    SelectingTimeState,
    TransitionOutcome,
)


def get_main_menu_text() -> str:
    return "📱 *Menú Principal*\n\n1️⃣ Agendar cita\n2️⃣ Mis citas\n3️⃣ Recordatorios\n4️⃣ Información\n5️⃣ Mis datos"


def _is_named_item_list(val: list[Any]) -> TypeIs[list[dict[str, str]]]:
    return all(isinstance(x, dict) and "id" in x and "name" in x for x in val)


def _is_time_slot_list(val: list[Any]) -> TypeIs[list[dict[str, str]]]:
    return all(isinstance(x, dict) and "id" in x and "label" in x and "start_time" in x for x in val)


def parse_action(text: str) -> BookingAction:
    trimmed = text.strip().lower()

    if trimmed in ["volver", "back", "atras", "menu", "menú", "inicio"]:
        return BackAction()
    if trimmed in ["cancelar", "cancel", "no quiero"]:
        return CancelAction()
    if trimmed in ["s", "y", "si", "sí", "yes", "confirmar", "confirmo", "ok", "dale"]:
        return ConfirmYesAction()
    if trimmed in ["n", "no", "nop", "nope"]:
        return ConfirmNoAction()

    if re.match(r"^\d+$", trimmed):
        return SelectAction(value=trimmed)

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
    current_state: BookingState,
    action: BookingAction,
    draft: DraftBooking,
    items: list[Any] | None = None,
) -> TransitionOutcome:
    # Global Actions
    if action.type == "cancel":
        return TransitionOutcome(nextState=IdleState(), responseText=get_main_menu_text(), advance=False)

    # Step Handlers
    if isinstance(current_state, IdleState):
        if isinstance(action, SelectAction):
            raw_items = items if items is not None else []
            if _is_named_item_list(raw_items):
                return TransitionOutcome(
                    nextState=SelectingSpecialtyState(items=raw_items),
                    responseText="🏥 *Selecciona la especialidad:*",
                    advance=True,
                )
            return TransitionOutcome(nextState=IdleState(), responseText="No hay especialidades disponibles.")

    elif isinstance(current_state, SelectingSpecialtyState):
        if isinstance(action, BackAction):
            return TransitionOutcome(nextState=IdleState(), responseText=get_main_menu_text(), advance=False)

        if isinstance(action, SelectAction):
            specialty_items = current_state.items
            specialty = next((i for i in specialty_items if i["id"] == action.value), None)

            if not specialty and re.match(r"^\d+$", action.value):
                idx = int(action.value) - 1
                if 0 <= idx < len(specialty_items):
                    specialty = specialty_items[idx]

            if not specialty:
                return TransitionOutcome(
                    nextState=SelectingSpecialtyState(items=specialty_items, error="Opción inválida."),
                    responseText="⚠️ Opción inválida. Por favor selecciona una especialidad.",
                    advance=False,
                )

            doctor_items = items if items is not None else []
            if _is_named_item_list(doctor_items) and doctor_items:
                return TransitionOutcome(
                    nextState=SelectingDoctorState(
                        specialtyId=specialty["id"],
                        specialtyName=specialty["name"],
                        items=doctor_items,
                    ),
                    responseText=f"👨‍⚕️ *Selecciona un profesional para {specialty['name']}:*",
                    advance=True,
                )
            return TransitionOutcome(
                nextState=SelectingDoctorState(specialtyId=specialty["id"], specialtyName=specialty["name"], items=[]),
                responseText=f"Buscando profesionales para {specialty['name']}...",
                advance=True,
            )

    elif isinstance(current_state, SelectingDoctorState):
        if isinstance(action, BackAction):
            raw_items = items if items is not None else []
            return TransitionOutcome(
                nextState=SelectingSpecialtyState(items=raw_items),
                responseText="🏥 *Selecciona la especialidad:*",
                advance=False,
            )

        if isinstance(action, SelectAction):
            doctor_items = current_state.items if current_state.items else (items if items is not None else [])
            doctor = next((i for i in doctor_items if i["id"] == action.value), None)

            if not doctor and re.match(r"^\d+$", action.value):
                idx = int(action.value) - 1
                if 0 <= idx < len(doctor_items):
                    doctor = doctor_items[idx]

            if not doctor:
                return TransitionOutcome(
                    nextState=SelectingDoctorState(
                        specialtyId=current_state.specialtyId,
                        specialtyName=current_state.specialtyName,
                        items=doctor_items,
                        error="Opción inválida.",
                    ),
                    responseText=f"⚠️ Opción inválida. Selecciona un profesional para {current_state.specialtyName}:",
                    advance=False,
                )

            time_items = items if items is not None else []
            if _is_time_slot_list(time_items) and time_items:
                return TransitionOutcome(
                    nextState=SelectingTimeState(
                        specialtyId=current_state.specialtyId,
                        doctorId=doctor["id"],
                        doctorName=doctor["name"],
                        items=time_items,
                    ),
                    responseText=f"📅 *Horarios disponibles con {doctor['name']}:*",
                    advance=True,
                )
            return TransitionOutcome(
                nextState=SelectingTimeState(
                    specialtyId=current_state.specialtyId,
                    doctorId=doctor["id"],
                    doctorName=doctor["name"],
                    items=[],
                ),
                responseText=f"Buscando horarios para {doctor['name']}...",
                advance=True,
            )

    elif isinstance(current_state, SelectingTimeState):
        if isinstance(action, BackAction):
            raw_items = items if items is not None else []
            return TransitionOutcome(
                nextState=SelectingDoctorState(
                    specialtyId=current_state.specialtyId,
                    specialtyName="",
                    items=raw_items,
                ),
                responseText="👨‍⚕️ *Selecciona un profesional:*",
                advance=False,
            )

        if isinstance(action, SelectAction):
            raw_items = items if items is not None else []
            time_items = current_state.items if current_state.items else raw_items

            slot = next((i for i in time_items if i["id"] == action.value or i["start_time"] == action.value), None)

            if not slot and re.match(r"^\d+$", action.value):
                idx = int(action.value) - 1
                if 0 <= idx < len(time_items):
                    slot = time_items[idx]

            if not slot:
                return TransitionOutcome(
                    nextState=SelectingTimeState(
                        specialtyId=current_state.specialtyId,
                        doctorId=current_state.doctorId,
                        doctorName=current_state.doctorName,
                        items=time_items,
                        error="Opción inválida.",
                    ),
                    responseText="⚠️ Opción inválida. Selecciona un horario:",
                    advance=False,
                )

            return TransitionOutcome(
                nextState=ConfirmingState(
                    specialtyId=current_state.specialtyId,
                    doctorId=current_state.doctorId,
                    doctorName=current_state.doctorName,
                    timeSlot=slot["label"],
                    draft=DraftCore(
                        specialty_id=current_state.specialtyId,
                        doctor_id=current_state.doctorId,
                        doctor_name=current_state.doctorName,
                        start_time=slot["start_time"],
                        time_label=slot["label"],
                    ),
                ),
                responseText=f"❓ *¿Confirmas tu cita con {current_state.doctorName} el {slot['label']}?*",
                advance=True,
            )

    elif isinstance(current_state, ConfirmingState):
        if isinstance(action, ConfirmYesAction):
            return TransitionOutcome(
                nextState=IdleState(),
                responseText="⏳ Procesando tu reserva...",
                advance=True,
            )

        if isinstance(action, ConfirmNoAction | BackAction):
            raw_items = items if items is not None else []
            return TransitionOutcome(
                nextState=SelectingTimeState(
                    specialtyId=current_state.specialtyId,
                    doctorId=current_state.doctorId,
                    doctorName=current_state.doctorName,
                    items=raw_items,
                ),
                responseText=f"📅 *Selecciona un nuevo horario con {current_state.doctorName}:*",
                advance=False,
            )

    return TransitionOutcome(nextState=IdleState(), responseText=get_main_menu_text(), advance=False)
