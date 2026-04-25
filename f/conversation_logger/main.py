import asyncio
# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Log messages to conversations table (incoming/outgoing)
# DB Tables Used  : conversations
# Concurrency Risk: NO — single-row INSERT
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — provider_id used for isolation context
# Pydantic Schemas: YES — InputSchema validates all fields
# ============================================================================

from typing import Any, Dict
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, fail, with_tenant_context
from ._logger_models import InputSchema, LogResult
from ._logger_logic import persist_log

MODULE = "conversation_logger"

async def _main_async(args: dict[str, Any]) -> Result[LogResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"validation_error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context
        async def operation() -> Result[LogResult]:
            return await persist_log(conn, input_data)

        return await with_tenant_context(conn, input_data.provider_id, operation)

    except Exception as e:
        log("Conversation Logger Internal Error", error=str(e), module=MODULE)
        return fail(f"orchestration_error: {e}")
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
