from __future__ import annotations

from typing import TYPE_CHECKING, TypedDict

if TYPE_CHECKING:
    from ._fsm_models import NamedItem, TimeSlotItem

# ============================================================================
# BOOKING FSM — Response Templates
# ============================================================================


class InlineButton(TypedDict):
    text: str
    callback_data: str


def build_header(error: str | None = None) -> str:
    return f"⚠️ {error}\n\n" if error else ""


def build_specialty_prompt(items: list[NamedItem], error: str | None = None) -> str:
    header = build_header(error)
    if not items:
        return f"{header}Lo sentimos, el sistema está temporalmente en mantenimiento. Intenta más tarde. 🛠️"
    lines = "\n".join(f"{i + 1}. {it['name']}" for i, it in enumerate(items))
    return f"{header}Selecciona la especialidad que necesitas:\n\n{lines}"


def build_doctors_prompt(specialty_name: str, items: list[NamedItem], error: str | None = None) -> str:
    header = build_header(error)
    if not items:
        return f"{header}No hay doctores disponibles en este momento para esa especialidad. 🛠️"
    lines = "\n".join(f"{i + 1}. {it['name']}" for i, it in enumerate(items))
    return f"{header}¿Con qué doctor deseas tu cita?\n\n{lines}"


def build_slots_prompt(doctor_name: str, items: list[TimeSlotItem], error: str | None = None) -> str:
    header = build_header(error)
    if not items:
        return f"{header}No hay horarios disponibles en este momento. 🛠️"
    lines = "\n".join(f"{i + 1}. {it['label']}" for i, it in enumerate(items))
    return f"{header}¿Qué horario prefieres?\n\n{lines}"


def build_confirmation_prompt(time_label: str, doctor_name: str, extra: str | None = None) -> str:
    prompt = extra or '¿Confirmas esta cita? Responde "sí" o "no".'
    return f"📋 *Confirmar Cita*\n\nDoctor: {doctor_name}\nHorario: {time_label}\n\n{prompt}"


def build_loading_doctors_prompt(specialty_name: str) -> str:
    return f"⏳ Buscando doctores disponibles en *{specialty_name}*..."


def build_loading_slots_prompt(doctor_name: str) -> str:
    return f"⏳ Buscando horarios disponibles con *{doctor_name}*..."


# ============================================================================
# KEYBOARD BUILDERS
# ============================================================================


def chunk_buttons(btns: list[InlineButton], size: int = 2) -> list[list[InlineButton]]:
    return [btns[i : i + size] for i in range(0, len(btns), size)]


def build_specialty_keyboard(items: list[NamedItem]) -> list[list[InlineButton]]:
    list_btns: list[InlineButton] = [{"text": it["name"], "callback_data": f"spec:{it['id']}"} for it in items]
    list_btns.append({"text": "❌ Cancelar", "callback_data": "cancel"})
    return chunk_buttons(list_btns)


def build_doctor_keyboard(items: list[NamedItem]) -> list[list[InlineButton]]:
    list_btns: list[InlineButton] = [{"text": it["name"], "callback_data": f"doc:{it['id']}"} for it in items]
    list_btns.append({"text": "⬅️ Volver", "callback_data": "back"})
    list_btns.append({"text": "❌ Cancelar", "callback_data": "cancel"})
    return chunk_buttons(list_btns)


def build_time_slot_keyboard(items: list[TimeSlotItem]) -> list[list[InlineButton]]:
    list_btns: list[InlineButton] = [{"text": it["label"], "callback_data": f"time:{it['id']}"} for it in items]
    list_btns.append({"text": "⬅️ Volver", "callback_data": "back"})
    list_btns.append({"text": "❌ Cancelar", "callback_data": "cancel"})
    return chunk_buttons(list_btns)


def build_confirmation_keyboard() -> list[list[InlineButton]]:
    return [
        [
            {"text": "✅ Sí, confirmar", "callback_data": "cfm:yes"},
            {"text": "❌ No, volver", "callback_data": "cfm:no"},
        ]
    ]
