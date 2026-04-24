from f.booking_orchestrator._orchestrator_models import OrchestratorInput, OrchestratorResult
from f.booking_orchestrator._get_entity import get_entity
from f.booking_create.main import main as create_booking
from f.internal._result import Result

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

async def handle_create_booking(
    input_data: OrchestratorInput
) -> Result[OrchestratorResult]:
    client_id = input_data.client_id
    provider_id = input_data.provider_id
    service_id = input_data.service_id
    date = input_data.date
    time = input_data.time

    # 1. SMART HANDOFF: Detect missing required fields for a direct booking
    if not all([client_id, provider_id, service_id, date, time]):
        return None, {
            "action": "crear_cita",
            "success": False,
            "data": None,
            "message": "He capturado parte de tu solicitud, pero para agendar necesito que completemos unos detalles en el asistente.",
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
            }
        }

    # 2. CALL CORE MODULE
    args = {
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

    return None, {
        "action": "crear_cita",
        "success": err is None,
        "data": data,
        "message": f"❌ No se pudo agendar: {err}" if err else f"✅ Cita agendada para el {date} a las {time}.",
        "follow_up": "¿Quieres intentar otro horario?" if err else None,
    }
