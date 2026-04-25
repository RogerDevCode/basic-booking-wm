from typing import Any
from f.booking_orchestrator._orchestrator_models import OrchestratorInput, OrchestratorResult
from f.booking_orchestrator._get_entity import get_entity
from ._get_my_bookings import handle_get_my_bookings
from f.booking_cancel.main import main as cancel_booking
from f.internal._result import Result

"""
PRE-FLIGHT
Mission          : Coordinate booking cancellation from orchestrator.
DB Tables Used   : (delegated)
Concurrency Risk : YES (delegated)
GCal Calls       : NO
Idempotency Key  : NO
RLS Tenant ID    : YES (delegated)
Zod Schemas      : NO
"""

async def handle_cancel_booking(
    conn: Any,

    input_data: OrchestratorInput
) -> Result[OrchestratorResult]:
    booking_id = input_data.booking_id or get_entity(input_data.entities, "booking_id")

    if not booking_id:
        # If no ID, show current bookings so user can pick
        cloned_input = input_data.model_copy(update={"notes": "Por favor, dime el ID de la cita que deseas cancelar."})
        return await handle_get_my_bookings(cloned_input)

    # Call booking_cancel
    args = {
        "booking_id": booking_id,
        "actor": "client",
        "actor_id": input_data.client_id,
        "reason": get_entity(input_data.entities, "reason") or input_data.notes,
    }

    err, data = await cancel_booking(args)

    return None, {
        "action": "cancelar_cita",
        "success": err is None,
        "data": data,
        "message": f"❌ No se pudo cancelar: {err}" if err else "✅ Tu cita ha sido cancelada exitosamente.",
    }
