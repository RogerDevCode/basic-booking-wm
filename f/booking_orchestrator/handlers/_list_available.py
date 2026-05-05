from datetime import datetime
from typing import cast

from f.availability_check.main import main_async as check_availability
from f.booking_orchestrator._orchestrator_models import AvailabilityData, OrchestratorInput, OrchestratorResult
from f.internal._result import DBClient, Result, fail, ok

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


async def handle_list_available(conn: DBClient, input_data: OrchestratorInput) -> Result[OrchestratorResult]:
    provider_id = input_data.provider_id
    date = input_data.date
    service_id = input_data.service_id

    if not provider_id or not date:
        return ok(
            cast(
                "OrchestratorResult",
                {
                    "action": "ver_disponibilidad",
                    "success": False,
                    "data": None,
                    "message": "Necesito el doctor y la fecha para consultar disponibilidad.",
                },
            )
        )

    # 1. CALL AVAILABILITY MODULE
    try:
        err_msg, data = await check_availability(
            {
                "provider_id": provider_id,
                "date": date,
                "service_id": service_id,
            }
        )
    except Exception as e:
        return fail(f"Failed to call availability_check: {e}")

    if err_msg or data is None:
        return ok(
            cast(
                "OrchestratorResult",
                {
                    "action": "ver_disponibilidad",
                    "success": False,
                    "data": None,
                    "message": f"❌ Error: {err_msg or 'Desconocido'}",
                },
            )
        )

    avail = cast("AvailabilityData", data)
    if avail.get("is_blocked"):
        return ok(
            cast(
                "OrchestratorResult",
                {
                    "action": "ver_disponibilidad",
                    "success": True,
                    "data": data,
                    "message": f"😅 No hay disponibilidad el {date}: {avail.get('block_reason', 'Motivo desconocido')}",
                },
            )
        )

    # Resolve UI limits
    limit = 10
    try:
        # data["provider_id"] should be available from availability check
        provider_id = avail.get("provider_id")
        if provider_id:
            # We already have a DB client in conn, let's fetch the UI preference
            prefs_row = await conn.fetchrow(
                "SELECT ui_preferences->>'max_slots_displayed' as max_s FROM providers WHERE provider_id = $1::uuid LIMIT 1",
                provider_id
            )
            if prefs_row and prefs_row["max_s"]:
                limit = int(prefs_row["max_s"])
    except Exception:
        pass

    all_slots = avail.get("slots", [])
    slots = [s for s in all_slots if s.get("available")]
    slots = slots[:limit]

    if not slots:
        return ok(
            cast(
                "OrchestratorResult",
                {
                    "action": "ver_disponibilidad",
                    "success": True,
                    "data": data,
                    "message": f"😅 No hay horarios disponibles el {date}.",
                },
            )
        )

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

    res: OrchestratorResult = {
        "action": "ver_disponibilidad",
        "success": True,
        "data": data,
        "message": message,
        "follow_up": "¿Te gustaría agendar alguno de estos horarios?",
    }
    return ok(res)
