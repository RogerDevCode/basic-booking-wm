from __future__ import annotations
import asyncio
import os
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

from typing import Any
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, with_tenant_context
from ._auth_models import (
    InputSchema, TempPasswordResult, PasswordChangeResult, VerifyResult
)
from ._auth_logic import (
    admin_generate_temp_password, provider_change_password, provider_verify
)

MODULE = "auth_provider"

type AuthResult = TempPasswordResult | PasswordChangeResult | VerifyResult

async def _main_async(args: dict[str, object]) -> Result[AuthResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context
        async def operation() -> Result[AuthResult]:
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


def main(args: dict[str, object]) -> AuthResult | None:
    import traceback
    try:
        err, result = asyncio.run(_main_async(args))
        if err:
            raise err
        return result
    except Exception as e:
        tb = traceback.format_exc()
        # Intentamos usar el adaptador local si está disponible, si no print
        try:
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            print(f"CRITICAL ERROR in {__file__}: {e}\n{tb}")
        
        # Elevamos para que Windmill marque como FAILED
        raise RuntimeError(f"Execution failed: {e}")
