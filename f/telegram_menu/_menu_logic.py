from typing import List, Dict, Any, Optional, Tuple
from ._menu_models import InputSchema, MenuResult

MAIN_MENU_KEYBOARD: List[List[str]] = [
    ['📅 Agendar cita', '📋 Mis citas'],
    ['🔔 Recordatorios', '❓ Información'],
]

OPTION_MAP: Dict[str, str] = {
    'agendar cita': 'book_appointment',
    'mis citas': 'my_bookings',
    'recordatorios': 'reminders',
    'información': 'info',
    '1': 'book_appointment',
    '2': 'my_bookings',
    '3': 'reminders',
    '4': 'info',
}

def parse_user_option(text: str) -> Optional[str]:
    lower = text.lower().strip()
    for key, value in OPTION_MAP.items():
        if key in lower:
            return value
    return None

def build_main_menu(chat_id: str) -> Dict[str, Any]:
    return {
        "text": '🏥 *Menú Principal*\n\nSelecciona una opción:',
        "reply_markup": {
            "keyboard": MAIN_MENU_KEYBOARD,
            "resize_keyboard": True,
            "one_time_keyboard": False,
        },
        "parse_mode": 'Markdown',
        "chat_id": chat_id,
    }

def handle_show_menu(input_data: InputSchema) -> MenuResult:
    result = build_main_menu(input_data.chat_id)
    return {
        "success": True,
        "data": result,
        "error_message": None
    }

def handle_select_option(input_data: InputSchema) -> MenuResult:
    user_input = input_data.user_input or ""
    action = parse_user_option(user_input)
    
    if not action:
        menu_result = build_main_menu(input_data.chat_id)
        menu_result["text"] = '⚠️ Opción no reconocida. Por favor selecciona una opción válida.'
        return {
            "success": False,
            "data": menu_result,
            "error_message": 'Invalid option selected'
        }

    return {
        "success": True,
        "data": {
            "action": action,
            "chat_id": input_data.chat_id,
            "client_id": input_data.client_id
        },
        "error_message": None
    }
