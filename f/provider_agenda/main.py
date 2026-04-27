from __future__ import annotations

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
from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, with_tenant_context
from ..internal._wmill_adapter import log
from ._agenda_logic import get_provider_agenda
from ._agenda_models import InputSchema

MODULE = "provider_agenda"


async def _main_async(args: dict[str, object]) -> Result[object]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context
        async def operation() -> Result[object]:
            # Construct AgendaInput from InputSchema
            from datetime import date

            from ._agenda_models import AgendaInput

            # Use date_from as the target_date for the single-day logic
            agenda_input = AgendaInput(
                provider_id=input_data.provider_id, target_date=date.fromisoformat(input_data.date_from)
            )
            return await get_provider_agenda(conn, agenda_input)

        return await with_tenant_context(conn, input_data.provider_id, operation)

    except Exception as e:
        log("Provider Agenda Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close()


async def main(args: dict[str, object]) -> object | None:
    """Windmill entrypoint."""
    import traceback

    try:
        err, result = await _main_async(args)
        if err:
            raise err
        return result
    except Exception as e:
        tb = traceback.format_exc()
        try:
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            print(f"CRITICAL ERROR in provider_agenda: {e}\n{tb}")

        # Elevamos para que Windmill marque como FAILED
        raise RuntimeError(f"Execution failed: {e}") from e
