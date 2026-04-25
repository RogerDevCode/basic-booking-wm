import asyncio
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

from typing import Any, Dict, cast
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import with_tenant_context, Result, ok, fail
from ._lock_models import InputSchema, LockResult
from ._lock_logic import acquire_lock, release_lock, check_lock, cleanup_locks

MODULE = "distributed_lock"

async def _main_async(args: dict[str, Any]) -> Result[LockResult]:
    # 1. Validate Input
    try:
        # Note: rawInput key compatibility from TS version if needed
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
