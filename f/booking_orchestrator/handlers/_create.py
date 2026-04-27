from typing import cast

from f.booking_create.main import main_async as create_booking
from f.booking_orchestrator._get_entity import get_entity
from f.booking_orchestrator._orchestrator_models import OrchestratorInput, OrchestratorResult
from f.internal._result import DBClient, Result, ok

"""
PRE-FLIGHT
Mission          : Coordinate booking creation from orchestrator.
DB Tables Used   : (delegated to booking_create)
Concurrency Risk : YES (delegated)
GCal Calls       : NO
Idempotency Key  : YES
RLS Tenant ID    : YES (delegated)
Zod Schemas      : NO
"""


async def handle_create_booking(conn: DBClient, input_data: OrchestratorInput) -> Result[OrchestratorResult]:
    client_id = input_data.client_id
    provider_id = input_data.provider_id
    service_id = input_data.service_id
    date = input_data.date
    time = input_data.time

    # 1. SMART HANDOFF: Detect missing required fields for a direct booking
    if not all([client_id, provider_id, service_id, date, time]):
        query = """
        SELECT 
            s.specialty_id as id,
            s.name,
            (SELECT COUNT(*) FROM providers p WHERE p.specialty_id = s.specialty_id AND p.is_active = true) as provider_count  # noqa: E501
        FROM specialties s
        WHERE s.is_active = true
        ORDER BY s.sort_order ASC, s.name ASC
        """  # noqa: E501
        rows = await conn.fetch(query)

        inline_buttons: list[list[dict[str, str]]] = []
        current_row: list[dict[str, str]] = []
        msg_parts: list[str] = ["🏥 *Selecciona la especialidad que necesitas:*\n"]

        for r in rows:
            name = str(r["name"])
            sp_id = str(r["id"])
            count = int(cast("int", r["provider_count"]))

            if count > 0:
                current_row.append({"text": name, "callback_data": f"spec:{sp_id}"})
                if len(current_row) == 2:
                    inline_buttons.append(current_row)
                    current_row = []
            else:
                msg_parts.append(f"• {name} *(temp. no disp.)*")

        if current_row:
            inline_buttons.append(current_row)

        inline_buttons.append([{"text": "❌ Cancelar", "callback_data": "cancel"}])

        message = "\n".join(msg_parts) if len(msg_parts) > 1 else msg_parts[0]

        res: OrchestratorResult = {
            "action": "crear_cita",
            "success": False,
            "data": None,
            "message": message,
            "inline_buttons": inline_buttons,
            "nextState": {"name": "selecting_specialty", "error": None, "items": []},
            "nextDraft": {
                "specialty_id": None,
                "specialty_name": get_entity(input_data.entities, "specialty_name"),
                "doctor_id": provider_id,
                "doctor_name": get_entity(input_data.entities, "provider_name"),
                "target_date": date,
                "start_time": f"{date}T{time}:00" if date and time else None,
                "time_label": time,
                "client_id": client_id,
            },
        }
        return ok(res)

    # 2. CALL CORE MODULE
    args: dict[str, object] = {
        "client_id": client_id,
        "provider_id": provider_id,
        "service_id": service_id,
        "start_time": f"{date}T{time}:00",
        "idempotency_key": f"orch-{client_id}-{provider_id}-{date}-{time}",
        "notes": input_data.notes,
        "actor": "client",
        "channel": input_data.channel,
    }

    err, data = await create_booking(args)

    res_final: OrchestratorResult = {
        "action": "crear_cita",
        "success": err is None,
        "data": data,
        "message": f"❌ No se pudo agendar: {err}" if err else f"✅ Cita agendada para el {date} a las {time}.",
        "follow_up": "¿Quieres intentar otro horario?" if err else None,
    }
    return ok(res_final)
