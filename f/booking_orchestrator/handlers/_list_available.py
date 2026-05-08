from __future__ import annotations

from collections.abc import Callable, Coroutine, Mapping
from datetime import datetime
from typing import Any, cast

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


async def handle_list_available(
    conn: DBClient, input_data: OrchestratorInput, delegates: Mapping[str, Callable[..., Coroutine[Any, Any, Any]]]
) -> Result[OrchestratorResult]:
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
        args = {
            "provider_id": provider_id,
            "date": date,
            "service_id": service_id,
        }
        res = await delegates["availability_check"](args=args)
        if isinstance(res, dict) and "error" in res:
            err_msg = str(res["error"])
            data = None
        else:
            err_msg = None
            data = res
    except Exception as e:
        import traceback

        from f.internal._wmill_adapter import log

        log("LIST_AVAILABLE_CRASH", error=str(e), traceback=traceback.format_exc(), module="booking_orchestrator")
        return fail(f"Failed to call availability_check: {e}")

    if err_msg or data is None:
        from f.internal._wmill_adapter import log

        log("LIST_AVAILABLE_API_ERROR", err_msg=str(err_msg), module="booking_orchestrator")
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
        pid = input_data.provider_id
        if pid:
            prefs_row = await conn.fetchrow(
                "SELECT ui_preferences->>'max_slots_displayed' as max_s"
                " FROM providers WHERE provider_id = $1::uuid LIMIT 1",
                pid,
            )
            if prefs_row and prefs_row["max_s"]:
                limit = int(str(prefs_row["max_s"]))
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
    tz_name = str(avail.get("timezone", "UTC"))
    import zoneinfo

    tz = zoneinfo.ZoneInfo(tz_name)

    morning: list[str] = []
    afternoon: list[str] = []
    for s in slots:
        # Parse ISO string (e.g. "2026-04-20T10:00:00Z")
        start_str = str(s["start"])
        dt_utc = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
        dt_local = dt_utc.astimezone(tz)
        time_str = dt_local.strftime("%H:%M")
        if dt_local.hour < 12:
            morning.append(time_str)
        else:
            afternoon.append(time_str)

    message = f"📅 *Disponibilidad para el {date}:*\n\n"
    if morning:
        message += f"🌅 *Mañana:*\n{', '.join(morning)}\n\n"
    if afternoon:
        message += f"🌇 *Tarde:*\n{', '.join(afternoon)}\n\n"

    res_avail: OrchestratorResult = {
        "action": "ver_disponibilidad",
        "success": True,
        "data": data,
        "message": message,
        "follow_up": "¿Te gustaría agendar alguno de estos horarios?",
    }
    return ok(res_avail)
