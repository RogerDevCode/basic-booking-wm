# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Manage medical specialties (CRUD + activate/deactivate)
# DB Tables Used  : specialties
# Concurrency Risk: NO
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates action and fields
# ============================================================================

from typing import Any, Dict
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, fail, with_tenant_context
from ._specialty_models import InputSchema, SpecialtyRow
from ._specialty_logic import list_specialties, create_specialty, update_specialty, delete_specialty, set_status

MODULE = "web_admin_specialties_crud"

async def main(args: dict[str, Any]) -> Result[Any]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context (using admin_user_id as isolation context)
        async def operation() -> Result[Any]:
            if input_data.action == 'list':
                return await list_specialties(conn)
            elif input_data.action == 'create':
                return await create_specialty(conn, input_data)
            elif input_data.action == 'update':
                if not input_data.specialty_id: return fail("update_failed: specialty_id is required")
                return await update_specialty(conn, input_data.specialty_id, input_data)
            elif input_data.action == 'delete':
                if not input_data.specialty_id: return fail("delete_failed: specialty_id is required")
                return await delete_specialty(conn, input_data.specialty_id)
            elif input_data.action == 'activate' or input_data.action == 'deactivate':
                if not input_data.specialty_id: return fail(f"{input_data.action}_failed: specialty_id is required")
                return await set_status(conn, input_data.specialty_id, input_data.action == 'activate')
            
            return fail(f"Unsupported action: {input_data.action}")

        return await with_tenant_context(conn, input_data.admin_user_id, operation)

    except Exception as e:
        log("Admin Specialty CRUD Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]
