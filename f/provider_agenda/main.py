import asyncio
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

async def _main_async(args: dict[str, Any]) -> Result[AgendaResult]:
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


def main(args: dict) -> None:
    import traceback
    try:
        return asyncio.run(_main_async(args))
    except Exception as e:
        tb = traceback.format_exc()
        # Intentamos usar el adaptador local si está disponible, si no print
        try:
            from ..internal._wmill_adapter import log
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=os.path.basename(os.path.dirname(__file__)))
        except:
            from ..internal._wmill_adapter import log
            log("BARE_EXCEPT_CAUGHT", file="main.py")
            print(f"CRITICAL ERROR in {__file__}: {e}\n{tb}")
        
        # Elevamos para que Windmill marque como FAILED
        raise RuntimeError(f"Execution failed: {e}")
