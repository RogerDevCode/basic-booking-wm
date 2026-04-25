import asyncio
# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Create or update client records
# DB Tables Used  : clients
# Concurrency Risk: NO — UPSERT pattern
# GCal Calls      : NO
# Idempotency Key : YES — multiple identifiers supported
# RLS Tenant ID   : YES — with_tenant_context wraps DB ops
# Pydantic Schemas: YES — InputSchema validates name, email, phone
# ============================================================================

from typing import Any, Dict
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, fail, with_tenant_context
from ._patient_models import InputSchema, ClientResult
from ._patient_logic import upsert_client

MODULE = "patient_register"

async def _main_async(args: dict[str, Any]) -> Result[ClientResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    # 2. Resolve Tenant
    tenant_id = input_data.provider_id or input_data.client_id
    if not tenant_id:
        return fail("tenant_id required for isolation (provider_id or client_id)")

    if not input_data.email and not input_data.phone and not input_data.telegram_chat_id:
        return fail("At least one identifier required (email, phone, or telegram_chat_id)")

    conn = await create_db_client()
    try:
        # 3. Execute with Tenant Context
        async def operation() -> Result[ClientResult]:
            return await upsert_client(conn, input_data)

        return await with_tenant_context(conn, tenant_id, operation)

    except Exception as e:
        log("Internal error in patient_register", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
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
