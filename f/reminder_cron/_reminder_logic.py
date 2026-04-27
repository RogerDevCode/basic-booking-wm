from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, cast

if TYPE_CHECKING:
    from ._reminder_models import BookingRecord, ReminderPrefs, ReminderWindow


def format_date_es(dt: datetime) -> str:
    days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    months = [
        "Enero",
        "Febrero",
        "Marzo",
        "Abril",
        "Mayo",
        "Junio",
        "Julio",
        "Agosto",
        "Septiembre",
        "Octubre",
        "Noviembre",
        "Diciembre",
    ]
    day_name = days[dt.weekday()]
    month_name = months[dt.month - 1]
    return f"{day_name}, {dt.day} de {month_name} de {dt.year}"


def format_time_es(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def get_client_preference(prefs: ReminderPrefs | None, channel: str, window: str) -> bool:
    if not prefs:
        return True
    key = f"{channel}_{window}"
    return bool(cast("Any", prefs).get(key, True))


def build_booking_details(booking: BookingRecord, tz: str) -> dict[str, object]:
    st_raw = booking["start_time"]
    st: datetime
    if isinstance(st_raw, str):
        st = datetime.fromisoformat(st_raw.replace("Z", "+00:00"))
    else:
        st = cast("datetime", st_raw)

    return {
        "date": format_date_es(st),
        "time": format_time_es(st),
        "provider_name": booking["provider_name"] or "Tu doctor",
        "service": booking["service_name"] or "Consulta",
        "booking_id": booking["booking_id"][:8].upper(),
        "client_name": booking["client_name"] or "Paciente",
    }


def build_inline_buttons(booking_id: str, window: ReminderWindow) -> list[dict[str, str]]:
    buttons: list[dict[str, str]] = []

    if window == "24h":
        buttons.extend(
            [
                {"text": "✅ Confirmar", "callback_data": f"cnf:{booking_id}"},
                {"text": "❌ Cancelar", "callback_data": f"cxl:{booking_id}"},
                {"text": "🔄 Reprogramar", "callback_data": f"res:{booking_id}"},
            ]
        )
    elif window == "2h":
        buttons.extend(
            [
                {"text": "✅ Voy a asistir", "callback_data": f"ack:{booking_id}"},
                {"text": "❌ Cancelar", "callback_data": f"cxl:{booking_id}"},
            ]
        )
    else:
        buttons.append({"text": "👍 En camino", "callback_data": f"ack:{booking_id}"})

    return buttons
