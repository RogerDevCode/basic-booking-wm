# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : View provider daily/weekly schedule with bookings
# DB Tables Used  : providers, provider_schedules, bookings, clients, services, schedule_overrides
# Concurrency Risk: NO — read-only
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context wraps DB ops
# Pydantic Schemas: YES — InputSchema validates provider_id, date_range
# ============================================================================

from typing import Any, Dict
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, fail, with_tenant_context
from ._agenda_models import InputSchema, AgendaResult
from ._agenda_logic import get_provider_agenda

MODULE = "provider_agenda"

async def main(args: dict[str, Any]) -> Result[AgendaResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context
        async def operation() -> Result[AgendaResult]:
            return await get_provider_agenda(conn, input_data)

        return await with_tenant_context(conn, input_data.provider_id, operation)

    except Exception as e:
        log("Provider Agenda Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]
