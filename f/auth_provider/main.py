# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "httpx>=0.28.1",
#   "pydantic>=2.10.0",
#   "email-validator>=2.2.0",
#   "asyncpg>=0.30.0",
#   "cryptography>=44.0.0",
#   "beartype>=0.19.0",
#   "returns>=0.24.0",
#   "redis>=7.4.0",
#   "typing-extensions>=4.12.0"
# ]
# ///
from __future__ import annotations

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
from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, with_tenant_context
from ..internal._wmill_adapter import log
from ._auth_logic import admin_generate_temp_password, provider_change_password, provider_verify
from ._auth_models import InputSchema, PasswordChangeResult, TempPasswordResult, VerifyResult

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
            if input_data.action == "admin_generate_temp":
                return await admin_generate_temp_password(conn, input_data)
            elif input_data.action == "provider_change":
                return await provider_change_password(conn, input_data)
            elif input_data.action == "provider_verify":
                return await provider_verify(conn, input_data)

            return fail(f"unsupported_action: {input_data.action}")

        return await with_tenant_context(conn, input_data.tenant_id, operation)

    except Exception as e:
        log("Auth Provider Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close()  # pyright: ignore[reportUnknownMemberType]


def main(args: InputSchema | dict[str, object]) -> dict[str, object]:
    import asyncio
    import traceback
    from typing import cast

    from pydantic import BaseModel

    try:
        if isinstance(args, InputSchema):
            validated = args
        else:
            validated = InputSchema.model_validate(args)
            
        err, result = asyncio.run(_main_async(validated.model_dump()))
        if err:
            raise err
            
        if result is None:
            return {}
        
        if isinstance(result, BaseModel):
            return cast("dict[str, object]", result.model_dump())
        elif isinstance(result, dict):
            return cast("dict[str, object]", result)
        else:
            return {"data": result}
            
    except Exception as e:
        tb = traceback.format_exc()
        try:
            from ..internal._wmill_adapter import log
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            pass
        raise RuntimeError(f"Execution failed: {e}") from e
