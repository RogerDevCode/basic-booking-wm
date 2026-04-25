from datetime import datetime
from typing import cast, Any
from f.booking_orchestrator._orchestrator_models import OrchestratorInput, OrchestratorResult, AvailabilityData
from f.internal._result import Result
from f.availability_check.main import main_async as check_availability

"""
PRE-FLIGHT
Mission          : Coordinate availability check from orchestrator.
DB Tables Used   : (delegated)
Concurrency Risk : NO
GCal Calls       : NO
Idempotency Key  : NO
RLS Tenant ID    : YES (delegated)
Zod Schemas      : NO
"""

async def handle_list_available(
    conn: Any,
    input_data: OrchestratorInput
) -> Result[OrchestratorResult]:
    provider_id = input_data.provider_id
    date = input_data.date
    service_id = input_data.service_id

    if not provider_id or not date:
        return None, {
            "action": "ver_disponibilidad",
            "success": False,
            "data": None,
            "message": "Necesito el doctor y la fecha para consultar disponibilidad.",
        }

    # 1. CALL AVAILABILITY MODULE
    try:
        err_msg, data = await check_availability({
            "provider_id": provider_id,
            "date": date,
            "service_id": service_id,
        })
    except Exception as e:
        return Exception(f"Failed to call availability_check: {e}"), None

    if err_msg or not data:
        return None, {
            "action": "ver_disponibilidad", "success": False, "data": None,
            "message": f"❌ Error: {err_msg or 'Desconocido'}",
        }

    avail = cast(AvailabilityData, data)
    if avail.get("is_blocked"):
        return None, {
            "action": "ver_disponibilidad", "success": True, "data": data,
            "message": f"😅 No hay disponibilidad el {date}: {avail.get('block_reason', 'Motivo desconocido')}",
        }

    all_slots = avail.get("slots", [])
    slots = [s for s in all_slots if s.get("available")]
    slots = slots[:10]
    
    if not slots:
        return None, {
            "action": "ver_disponibilidad", "success": True, "data": data,
            "message": f"😅 No hay horarios disponibles el {date}.",
        }

    # 2. FORMAT RESPONSE
    morning: list[str] = []
    afternoon: list[str] = []
    for s in slots:
        # Parse ISO string (e.g. "2026-04-20T10:00:00Z")
        start_str = str(s["start"])
        dt = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
        time_str = dt.strftime("%H:%M")
        if dt.hour < 12:
            morning.append(time_str)
        else:
            afternoon.append(time_str)

    message = f"📅 *Disponibilidad para el {date}:*\n\n"
    if morning:
        message += f"🌅 *Mañana:*\n{', '.join(morning)}\n\n"
    if afternoon:
        message += f"🌇 *Tarde:*\n{', '.join(afternoon)}\n\n"

    return None, {
        "action": "ver_disponibilidad", "success": True, "data": data,
        "message": message,
        "follow_up": "¿Te gustaría agendar alguno de estos horarios?"
    }
