# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : CRUD for honorifics management
# DB Tables Used  : honorifics
# Concurrency Risk: NO
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context for mutations
# Pydantic Schemas: YES — InputSchema validates action and fields
# ============================================================================

from typing import Any, Dict
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, fail, with_tenant_context, with_admin_context
from ._honorifics_models import InputSchema, HonorificRow
from ._honorifics_logic import list_honorifics, create_honorific, update_honorific, delete_honorific

MODULE = "admin_honorifics"

async def main(args: dict[str, Any]) -> Result[Any]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        if input_data.action == 'list':
            # List is global (admin mode)
            return await with_admin_context(conn, lambda: list_honorifics(conn))

        # Mutations require tenant isolation
        async def operation() -> Result[Any]:
            if input_data.action == 'create':
                if not input_data.code or not input_data.label:
                    return fail("create_failed: code and label are required")
                return await create_honorific(
                    conn, input_data.code, input_data.label, input_data.gender,
                    input_data.sort_order or 99, input_data.is_active if input_data.is_active is not None else True
                )
            elif input_data.action == 'update':
                if not input_data.honorific_id:
                    return fail("update_failed: honorific_id is required")
                return await update_honorific(
                    conn, input_data.honorific_id, input_data.code, input_data.label,
                    input_data.gender, input_data.sort_order, input_data.is_active
                )
            elif input_data.action == 'delete':
                if not input_data.honorific_id:
                    return fail("delete_failed: honorific_id is required")
                return await delete_honorific(conn, input_data.honorific_id)
            
            return fail(f"unsupported_action: {input_data.action}")

        return await with_tenant_context(conn, input_data.tenant_id, operation)

    except Exception as e:
        log("Admin Honorifics Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]
