# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Password management for providers
# DB Tables Used  : providers
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
from ._auth_models import InputSchema
from ._auth_logic import (
    admin_generate_temp_password, provider_change_password, provider_verify
)

MODULE = "auth_provider"

async def main(args: dict[str, Any]) -> Result[Any]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context
        async def operation() -> Result[Any]:
            if input_data.action == 'admin_generate_temp':
                return await admin_generate_temp_password(conn, input_data)
            elif input_data.action == 'provider_change':
                return await provider_change_password(conn, input_data)
            elif input_data.action == 'provider_verify':
                return await provider_verify(conn, input_data)
            
            return fail(f"unsupported_action: {input_data.action}")

        return await with_tenant_context(conn, input_data.tenant_id, operation)

    except Exception as e:
        log("Auth Provider Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]
