from __future__ import annotations
import asyncio
import os
# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Advisory lock for race condition prevention
# DB Tables Used  : booking_locks, providers
# Concurrency Risk: YES — lock mechanism itself
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — provider_id used for all queries
# Pydantic Schemas: YES — InputSchema validates action and key
# ============================================================================

from typing import Any, cast
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import with_tenant_context, Result, ok, fail
from ._lock_models import InputSchema, LockResult
from ._lock_logic import acquire_lock, release_lock, check_lock, cleanup_locks

MODULE = "distributed_lock"

async def _main_async(args: dict[str, object]) -> Result[LockResult]:
    # 1. Validate Input
    try:
        data = args.get("rawInput", args)
        input_data = InputSchema.model_validate(data)
    except Exception as e:
        return fail(f"validation_failed: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context
        async def operation() -> Result[LockResult]:
            if input_data.action == 'acquire':
                return await acquire_lock(conn, input_data)
            elif input_data.action == 'release':
                return await release_lock(conn, input_data)
            elif input_data.action == 'check':
                return await check_lock(conn, input_data.lock_key)
            elif input_data.action == 'cleanup':
                return await cleanup_locks(conn)
            
            return fail(f"unsupported_action: {input_data.action}")

        return await with_tenant_context(conn, input_data.provider_id, operation)

    except Exception as e:
        log("Distributed Lock Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close()


def main(args: dict[str, object]) -> LockResult | None:
    import traceback
    try:
        err, result = asyncio.run(_main_async(args))
        if err:
            raise err
        return result
    except Exception as e:
        tb = traceback.format_exc()
        try:
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            print(f"CRITICAL ERROR in distributed_lock: {e}\n{tb}")
        
        # Elevamos para que Windmill marque como FAILED
        raise RuntimeError(f"Execution failed: {e}")
