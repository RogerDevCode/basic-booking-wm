from __future__ import annotations
import asyncio
import os
# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Auto-register user from Telegram webhook payload
# DB Tables Used  : users
# Concurrency Risk: NO — UPSERT by telegram_chat_id
# GCal Calls      : NO
# Idempotency Key : YES — handled by checking existing chat_id
# RLS Tenant ID   : YES — with_admin_context bypasses RLS for user discovery
# Pydantic Schemas: YES — InputSchema validates Telegram webhook structure
# ============================================================================

from typing import Any
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, fail, with_admin_context
from ._auto_register_models import InputSchema, RegisterResult
from ._auto_register_logic import register_telegram_user

MODULE = "telegram_auto_register"

async def _main_async(args: dict[str, object]) -> Result[RegisterResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute Auth Transaction with Admin Context (bypass RLS)
        async def operation() -> Result[RegisterResult]:
            return await register_telegram_user(conn, input_data)

        return await with_admin_context(conn, operation)

    except Exception as e:
        log("Internal error in auto_register", error=str(e), module=MODULE)
        return fail(f"Internal error: {e}")
    finally:
        await conn.close()


def main(args: dict[str, object]) -> RegisterResult | None:
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
            print(f"CRITICAL ERROR in telegram_auto_register: {e}\n{tb}")
        
        # Elevamos para que Windmill marque como FAILED
        raise RuntimeError(f"Execution failed: {e}")
