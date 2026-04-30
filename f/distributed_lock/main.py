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
# Mission         : Advisory lock for race condition prevention
# DB Tables Used  : booking_locks, providers
# Concurrency Risk: YES — lock mechanism itself
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — provider_id used for all queries
# Pydantic Schemas: YES — InputSchema validates action and key
# ============================================================================
from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, with_tenant_context
from ..internal._wmill_adapter import log
from ._lock_logic import acquire_lock, check_lock, cleanup_locks, release_lock
from ._lock_models import InputSchema, LockResult

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
            if input_data.action == "acquire":
                return await acquire_lock(conn, input_data)
            elif input_data.action == "release":
                return await release_lock(conn, input_data)
            elif input_data.action == "check":
                return await check_lock(conn, input_data.lock_key)
            elif input_data.action == "cleanup":
                return await cleanup_locks(conn)

            return fail(f"unsupported_action: {input_data.action}")

        return await with_tenant_context(conn, input_data.provider_id, operation)

    except Exception as e:
        log("Distributed Lock Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close()


def main(args: dict[str, object]) -> Result[LockResult]:
    import asyncio

    """Windmill entrypoint."""
    return asyncio.run(_main_async(args))
