import asyncio
# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Client profile CRUD (get/update)
# DB Tables Used  : clients, users
# Concurrency Risk: NO
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates parameters
# ============================================================================

from typing import Any, Dict
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, fail, with_tenant_context
from ._profile_models import InputSchema, ProfileResult
from ._profile_logic import find_user, find_or_create_client, update_profile, map_to_profile

MODULE = "web_patient_profile"

async def _main_async(args: dict[str, Any]) -> Result[ProfileResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context (user_id)
        async def operation() -> Result[ProfileResult]:
            # Resolve User
            err_u, user = await find_user(conn, input_data.user_id)
            if err_u or not user: return fail(err_u or "user_not_found")

            # Find or Auto-Create Client
            err_c, client = await find_or_create_client(conn, input_data.user_id, user)
            if err_c or not client: return fail(err_c or "client_not_found")

            final_client = client
            if input_data.action == 'update':
                err_up, updated = await update_profile(conn, str(final_client["client_id"]), input_data)
                if err_up or not updated: return fail(err_up or "update_failed")
                final_client = updated

            return ok(map_to_profile(final_client))

        return await with_tenant_context(conn, input_data.user_id, operation)

    except Exception as e:
        log("Patient Profile Internal Error", error=str(e), module=MODULE)
        return fail(f"fatal_error: {e}")
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]


def main(args: dict):
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
