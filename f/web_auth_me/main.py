# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Get current user profile + role by user_id
# DB Tables Used  : users
# Concurrency Risk: NO — read-only
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates user_id
# ============================================================================

from typing import Any
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import with_tenant_context, Result, ok, fail
from ._me_models import InputSchema, UserProfileResult
from ._me_logic import get_user_profile

MODULE = "web_auth_me"

async def main(args: dict[str, Any]) -> Result[UserProfileResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context
        async def operation() -> Result[UserProfileResult]:
            return await get_user_profile(conn, input_data.user_id)

        return await with_tenant_context(conn, input_data.user_id, operation)

    except Exception as e:
        log("Internal error in web_auth_me", error=str(e), module=MODULE)
        return fail(f"Internal error: {e}")
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]
