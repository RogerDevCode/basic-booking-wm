from typing import cast
from f.booking_orchestrator._orchestrator_models import OrchestratorInput, OrchestratorResult
from f.booking_orchestrator._get_entity import get_entity
from ._get_my_bookings import handle_get_my_bookings
from f.booking_reschedule.main import main_async as reschedule_booking
from f.internal._result import Result, DBClient, ok, fail

"""
PRE-FLIGHT
Mission          : Coordinate booking rescheduling from orchestrator.
DB Tables Used   : (delegated)
Concurrency Risk : YES (delegated)
GCal Calls       : NO
Idempotency Key  : NO
RLS Tenant ID    : YES (delegated)
Zod Schemas      : NO
"""

async def handle_reschedule(
    conn: DBClient,
    input_data: OrchestratorInput
) -> Result[OrchestratorResult]:
    booking_id = input_data.booking_id or get_entity(input_data.entities, "booking_id")
    date = input_data.date
    time = input_data.time

    if not booking_id:
        cloned_input = input_data.model_copy(update={"notes": "Dime el ID de la cita que quieres mover y la nueva fecha/hora."})
        return await handle_get_my_bookings(conn, cloned_input)

    if not date or not time:
        res: OrchestratorResult = {
            "action": "reagendar_cita",
            "success": False,
            "data": None,
            "message": "Necesito la nueva fecha y hora para reagendar.",
            "follow_up": "¿Para cuándo te gustaría moverla?",
            "nextState": {"name": "selecting_time", "specialtyId": "", "doctorId": "", "doctorName": "", "targetDate": date, "error": None, "items": []},
            "nextDraft": {
                "specialty_id": None, "specialty_name": None,
                "doctor_id": input_data.provider_id,
                "doctor_name": get_entity(input_data.entities, "provider_name"),
                "target_date": date,
                "start_time": None, "time_label": None,
                "client_id": input_data.client_id,
            }
        }
        return ok(res)

    # Call booking_reschedule
    args: dict[str, object] = {
        "booking_id": booking_id,
        "new_start_time": f"{date}T{time}:00",
        "actor": "client",
        "actor_id": input_data.client_id,
        "reason": get_entity(input_data.entities, "reason") or input_data.notes,
        "idempotency_key": f"orch-resch-{booking_id}-{date}-{time}",
    }

    err, data = await reschedule_booking(args)

    res_final: OrchestratorResult = {
        "action": "reagendar_cita",
        "success": err is None,
        "data": data,
        "message": f"❌ No se pudo reagendar: {err}" if err else f"✅ Reagendada para el {date} a las {time}.",
    }
    return ok(res_final)
