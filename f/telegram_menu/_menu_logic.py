from typing import Any
from typing import List, Dict, Any, Optional

class MenuInput:
    def __init__(self, action: str, chat_id: str, user_input: Optional[str] = None) -> None:
        self.action = action
        self.chat_id = chat_id
        self.user_input = user_input

class MenuResponse:
    def __init__(self, handled: bool, response_text: str, inline_buttons: List[List[Dict[str, Any]]]) -> None:
        self.handled = handled
        self.response_text = response_text
        self.inline_buttons = inline_buttons

MAIN_MENU_INLINE = [
    [{"text": "📅 Agendar Cita", "callback_data": "cmd:book"}],
    [{"text": "📋 Mis Citas", "callback_data": "cmd:mybookings"}]
]

def parse_user_option(text: str) -> Optional[str]:
    lower = text.lower().strip()
    if lower == "cmd:book" or "agendar" in lower: return "book_appointment"
    if lower == "cmd:mybookings" or "mis citas" in lower: return "my_bookings"
    return None

class MenuController:
    async def handle(self, input_data: MenuInput) -> MenuResponse:
        if input_data.action in ["start", "show"]:
            return MenuResponse(
                handled=True,
                response_text="🏥 *AutoAgenda - Menú Principal*\n\n¿Cómo podemos ayudarte hoy?",
                inline_buttons=MAIN_MENU_INLINE
            )
            
        if input_data.action == "select_option":
            user_input = input_data.user_input or ""
            parsed = parse_user_option(user_input)
            
            if parsed:
                # Si reconoció la acción, cedemos el control al orquestador
                return MenuResponse(handled=False, response_text="", inline_buttons=[])
            else:
                # Opción inválida, repite el menú
                return MenuResponse(
                    handled=True,
                    response_text="⚠️ Opción no reconocida.\n\n🏥 *AutoAgenda - Menú Principal*\n\nSelecciona una opción:",
                    inline_buttons=MAIN_MENU_INLINE
                )
                
        return MenuResponse(handled=False, response_text="", inline_buttons=[])
