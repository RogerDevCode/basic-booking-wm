import asyncio
# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : CRUD for providers management (admin dashboard)
# DB Tables Used  : providers, honorifics, specialties, regions, communes, timezones
# Concurrency Risk: NO
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context for mutations
# Pydantic Schemas: YES — InputSchema validates all fields
# ============================================================================

from typing import Any, Dict
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, fail, with_tenant_context, with_admin_context
from ._provider_models import InputSchema, ProviderRow, CreateProviderResult
from ._provider_logic import list_providers, create_provider, update_provider, reset_provider_password

MODULE = "web_admin_provider_crud"

async def _main_async(args: dict[str, Any]) -> Result[Any]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        # 'list' is global admin operation
        if input_data.action == 'list':
            return await with_admin_context(conn, lambda: list_providers(conn))

        # Other actions require provider_id (tenant context)
        if not input_data.provider_id:
            return fail("provider_id is required for non-list operations")

        async def operation() -> Result[Any]:
            if input_data.action == 'create':
                return await create_provider(conn, input_data)
            elif input_data.action == 'update':
                return await update_provider(conn, input_data.provider_id, input_data)
            elif input_data.action == 'activate' or input_data.action == 'deactivate':
                active = (input_data.action == 'activate')
                await conn.execute(
                    "UPDATE providers SET is_active = $1, updated_at = NOW() WHERE id = $2::uuid",
                    active, input_data.provider_id
                )
                return ok({"provider_id": input_data.provider_id, "is_active": active})
            elif input_data.action == 'reset_password':
                return await reset_provider_password(conn, input_data.provider_id)
            
            return fail(f"Unsupported action: {input_data.action}")

        return await with_tenant_context(conn, input_data.provider_id, operation)

    except Exception as e:
        log("Admin Provider CRUD Internal Error", error=str(e), module=MODULE)
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
