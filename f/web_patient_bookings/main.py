import asyncio

# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Client booking history and upcoming appointments
# DB Tables Used  : bookings, providers, services, clients, users
# Concurrency Risk: NO — read-only
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates parameters
# ============================================================================
from typing import Any

from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, with_tenant_context
from ..internal._wmill_adapter import log
from ._bookings_logic import get_patient_bookings, resolve_client_id
from ._bookings_models import BookingsResult, InputSchema

MODULE = "web_patient_bookings"


async def _main_async(args: dict[str, Any]) -> Result[BookingsResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context (client_user_id)
        async def operation() -> Result[BookingsResult]:
            err_id, client_id = await resolve_client_id(conn, input_data.client_user_id)
            if err_id or not client_id:
                return fail(err_id or "client_not_found")

            return await get_patient_bookings(conn, client_id, input_data)

        return await with_tenant_context(conn, input_data.client_user_id, operation)

    except Exception as e:
        log("Patient Bookings Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close()  # pyright: ignore[reportUnknownMemberType]


def main(args: dict[str, Any]) -> Result[BookingsResult]:
    import traceback

    try:
        return asyncio.run(_main_async(args))
    except Exception as e:
        tb = traceback.format_exc()
        # Intentamos usar el adaptador local si está disponible, si no print
        try:
            from ..internal._wmill_adapter import log

            log(
                "CRITICAL_ENTRYPOINT_ERROR",
                error=str(e),
                traceback=tb,
                module=MODULE,
            )
        except Exception:
            from ..internal._wmill_adapter import log

            log("BARE_EXCEPT_CAUGHT", file="main.py")
            print(f"CRITICAL ERROR in {__file__}: {e}\n{tb}")

        # Elevamos para que Windmill marque como FAILED
        raise RuntimeError(f"Execution failed: {e}") from e
