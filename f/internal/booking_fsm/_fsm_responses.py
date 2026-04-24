from typing import List, Optional, Dict, Any, TypedDict

# ============================================================================
# BOOKING FSM — Response Templates
# ============================================================================

class InlineButton(TypedDict):
    text: str
    callback_data: str

def build_header(error: Optional[str] = None) -> str:
    return f"⚠️ {error}\n\n" if error else ""

def build_specialty_prompt(items: List[Dict[str, str]], error: Optional[str] = None) -> str:
    header = build_header(error)
    return f"{header}Selecciona la especialidad que necesitas:"

def build_doctors_prompt(specialty_name: str, items: List[Dict[str, str]], error: Optional[str] = None) -> str:
    header = build_header(error)
    return f"{header}¿Con qué doctor deseas tu cita?"

def build_slots_prompt(doctor_name: str, items: List[Dict[str, str]], error: Optional[str] = None) -> str:
    header = build_header(error)
    return f"{header}¿Qué horario prefieres?"

def build_confirmation_prompt(time_label: str, doctor_name: str, extra: Optional[str] = None) -> str:
    prompt = extra or '¿Confirmas esta cita? Responde "sí" o "no".'
    return f"📋 *Confirmar Cita*\n\nDoctor: {doctor_name}\nHorario: {time_label}\n\n{prompt}"

def build_loading_doctors_prompt(specialty_name: str) -> str:
    return f"⏳ Buscando doctores disponibles en *{specialty_name}*..."

def build_loading_slots_prompt(doctor_name: str) -> str:
    return f"⏳ Buscando horarios disponibles con *{doctor_name}*..."

# ============================================================================
# KEYBOARD BUILDERS
# ============================================================================

def chunk_buttons(btns: List[InlineButton], size: int = 2) -> List[List[InlineButton]]:
    return [btns[i:i + size] for i in range(0, len(btns), size)]

def build_specialty_keyboard(items: List[Dict[str, str]]) -> List[List[InlineButton]]:
    list_btns = [{"text": it["name"], "callback_data": f"spec:{it['id']}"} for it in items]
    list_btns.append({"text": "❌ Cancelar", "callback_data": "cancel"})
    return chunk_buttons(list_btns)

def build_doctor_keyboard(items: List[Dict[str, str]]) -> List[List[InlineButton]]:
    list_btns = [{"text": it["name"], "callback_data": f"doc:{it['id']}"} for it in items]
    list_btns.append({"text": "⬅️ Volver", "callback_data": "back"})
    list_btns.append({"text": "❌ Cancelar", "callback_data": "cancel"})
    return chunk_buttons(list_btns)

def build_time_slot_keyboard(items: List[Dict[str, str]]) -> List[List[InlineButton]]:
    list_btns = [{"text": it["label"], "callback_data": f"time:{it['id']}"} for it in items]
    list_btns.append({"text": "⬅️ Volver", "callback_data": "back"})
    list_btns.append({"text": "❌ Cancelar", "callback_data": "cancel"})
    return chunk_buttons(list_btns)

def build_confirmation_keyboard() -> List[List[InlineButton]]:
    return [
        [
            {"text": "✅ Sí, confirmar", "callback_data": "cfm:yes"},
            {"text": "❌ No, volver", "callback_data": "cfm:no"}
        ]
    ]
