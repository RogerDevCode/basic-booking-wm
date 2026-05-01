# /// script
# requires-python = ">=3.12"
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
# Mission         : Create or update client records
# DB Tables Used  : clients
# Concurrency Risk: NO — UPSERT pattern
# GCal Calls      : NO
# Idempotency Key : YES — multiple identifiers supported
# RLS Tenant ID   : YES — with_tenant_context wraps DB ops
# Pydantic Schemas: YES — InputSchema validates name, email, phone
# ============================================================================
from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, with_tenant_context
from ..internal._wmill_adapter import log
from ._patient_logic import upsert_client
from ._patient_models import ClientResult, InputSchema

MODULE = "patient_register"


async def _main_async(args: dict[str, object]) -> Result[ClientResult]:
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
        await conn.close()


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
