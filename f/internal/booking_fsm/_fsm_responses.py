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
    return f"{header}¿Con qué doctor deseas tu hora?\n\n{lines}"


def build_doctors_with_specialty_prompt(
    matches: list[dict[str, str]],
    error: str | None = None,
) -> str:
    """Numbered prompt for multi-match doctor search. Each match must have 'name' and 'specialty_name'."""
    header = build_header(error)
    if not matches:
        return f"{header}No hay doctores disponibles en este momento. 🛠️"
    lines = "\n".join(f"{i + 1}. {m['name']} ({m['specialty_name']})" for i, m in enumerate(matches))
    return f"{header}Encontré varios doctores con ese nombre. ¿Con cuál deseas agendar?\n\n{lines}"


def build_slots_prompt(doctor_name: str, items: list[TimeSlotItem], error: str | None = None) -> str:
    header = build_header(error)
    if not items:
        return f"{header}No hay horarios disponibles en este momento. 🛠️"
    lines = "\n".join(f"{i + 1}. {it['label']}" for i, it in enumerate(items))
    return f"{header}¿Qué horario prefieres?\n\n{lines}"


def build_confirmation_prompt(time_label: str, doctor_name: str, extra: str | None = None) -> str:
    prompt = extra or '¿Confirmas esta hora? Responde "sí" o "no".'
    return f"📋 *Confirmar Hora*\n\nDoctor: {doctor_name}\nHorario: {time_label}\n\n{prompt}"


def build_loading_doctors_prompt(specialty_name: str) -> str:
    return f"⏳ Buscando doctores disponibles en *{specialty_name}*..."


def build_loading_slots_prompt(doctor_name: str) -> str:
    return f"⏳ Buscando horarios disponibles con *{doctor_name}*..."


# ============================================================================
# KEYBOARD BUILDERS
# ============================================================================


def chunk_buttons(btns: list[InlineButton], size: int = 2) -> list[list[InlineButton]]:
    return [btns[i : i + size] for i in range(0, len(btns), size)]


def build_specialty_keyboard(items: list[NamedItem], session_id: str | None = None) -> list[list[InlineButton]]:
    suffix = f"|{session_id}" if session_id else ""
    list_btns: list[InlineButton] = [
        {"text": f"{it['name']}", "callback_data": f"spec:{it['id']}{suffix}"} for it in items
    ]
    list_btns.append({"text": "🏠 Menú Principal", "callback_data": f"cancel{suffix}"})
    return chunk_buttons(list_btns, size=2)


def build_doctor_keyboard(
    items: list[NamedItem],
    page: int = 1,
    page_size: int = 4,
    session_id: str | None = None,
) -> list[list[InlineButton]]:
    suffix = f"|{session_id}" if session_id else ""

    total_items = len(items)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    page_items = items[start_idx:end_idx]

    list_btns: list[InlineButton] = [
        {"text": f"{it['name']}", "callback_data": f"doc:{it['id']}{suffix}"} for it in page_items
    ]

    chunked = chunk_buttons(list_btns, size=2)

    nav_row: list[InlineButton] = []
    if page > 1:
        nav_row.append({"text": "◀ Anterior", "callback_data": f"page:doctors:{page - 1}{suffix}"})
    if end_idx < total_items:
        nav_row.append({"text": "Siguiente ▶", "callback_data": f"page:doctors:{page + 1}{suffix}"})

    if nav_row:
        chunked.append(nav_row)

    chunked.append(
        [
            {"text": "⬅️ Volver", "callback_data": f"back{suffix}"},
            {"text": "🏠 Menú Principal", "callback_data": f"cancel{suffix}"},
        ]
    )
    return chunked


def build_time_slot_keyboard(items: list[TimeSlotItem], session_id: str | None = None) -> list[list[InlineButton]]:
    suffix = f"|{session_id}" if session_id else ""
    list_btns: list[InlineButton] = [
        {"text": f"{it['label']}", "callback_data": f"time:{it['id']}{suffix}"} for it in items
    ]

    chunked = chunk_buttons(list_btns, size=2)
    chunked.append(
        [
            {"text": "⬅️ Volver", "callback_data": f"back{suffix}"},
            {"text": "🏠 Menú Principal", "callback_data": f"cancel{suffix}"},
        ]
    )
    return chunked


def build_confirmation_keyboard(session_id: str | None = None) -> list[list[InlineButton]]:
    suffix = f"|{session_id}" if session_id else ""
    return [
        [
            {"text": "✅ Sí, confirmar", "callback_data": f"cfm:yes{suffix}"},
            {"text": "❌ No, volver", "callback_data": f"cfm:no{suffix}"},
        ]
    ]
