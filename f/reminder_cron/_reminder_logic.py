from typing import Any
from datetime import datetime
from typing import List, Dict, Any, Optional, cast
from ._reminder_models import BookingRecord, ReminderWindow, ReminderPrefs

def format_date_es(dt: datetime) -> str:
    # Manual format to match Spanish/Argentine style without complex locales
    days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
    
    day_name = days[dt.weekday()]
    month_name = months[dt.month - 1]
    return f"{day_name}, {dt.day} de {month_name} de {dt.year}"

def format_time_es(dt: datetime) -> str:
    return dt.strftime("%H:%M")

def get_client_preference(
    prefs: Optional[ReminderPrefs],
    channel: str,
    window: str
) -> bool:
    if not prefs: return True
    key = f"{channel}_{window}"
    return cast(bool, prefs.get(key, True))

def build_booking_details(
    booking: BookingRecord,
    tz: str
) -> Dict[str, str]:
    st = booking["start_time"]
    if isinstance(st, str):
        st = datetime.fromisoformat(st.replace("Z", "+00:00"))
        
    return {
        "date": format_date_es(st),
        "time": format_time_es(st),
        "provider_name": booking["provider_name"] or 'Tu doctor',
        "service": booking["service_name"] or 'Consulta',
        "booking_id": booking["booking_id"][:8].upper(),
        "client_name": booking["client_name"] or 'Paciente',
    }

def build_inline_buttons(
    booking_id: str,
    window: ReminderWindow
) -> List[Dict[str, str]]:
    short_id = booking_id
    buttons = []

    if window == '24h':
        buttons.extend([
            {"text": '✅ Confirmar', "callback_data": f"cnf:{short_id}"},
            {"text": '❌ Cancelar', "callback_data": f"cxl:{short_id}"},
            {"text": '🔄 Reprogramar', "callback_data": f"res:{short_id}"}
        ])
    elif window == '2h':
        buttons.extend([
            {"text": '✅ Voy a asistir', "callback_data": f"ack:{short_id}"},
            {"text": '❌ Cancelar', "callback_data": f"cxl:{short_id}"}
        ])
    else:
        buttons.append({"text": '👍 En camino', "callback_data": f"ack:{short_id}"})

    return buttons
