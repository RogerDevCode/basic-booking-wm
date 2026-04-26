from __future__ import annotations
import asyncio
import os
# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Dead Letter Queue (DLQ) processor for failed bookings
# DB Tables Used  : booking_dlq
# Concurrency Risk: YES — atomic updates and FOR UPDATE locks
# GCal Calls      : NO
# Idempotency Key : YES — preserved from failed bookings
# RLS Tenant ID   : NO — global system table
# Pydantic Schemas: YES — InputSchema validates actions and IDs
# ============================================================================

from typing import Any, Union
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, with_admin_context
from ._dlq_models import InputSchema, DLQListResult

MODULE = "dlq_processor"

async def _main_async(args: dict[str, object]) -> Result[object]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"validation_error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Admin Context (global system table)
        async def operation() -> Result[object]:
            if input_data.action == 'list':
                return await list_dlq(conn, input_data.status_filter)
            elif input_data.action == 'retry':
                return await retry_dlq(conn, input_data.dlq_id)
            elif input_data.action == 'resolve':
                if input_data.dlq_id is None:
                    return fail("resolve_error: dlq_id is required")
                return await resolve_dlq(conn, input_data.dlq_id, input_data.resolved_by, input_data.resolution_notes)
            elif input_data.action == 'discard':
                if input_data.dlq_id is None:
                    return fail("discard_error: dlq_id is required")
                return await discard_dlq(conn, input_data.dlq_id, input_data.resolution_notes)
            elif input_data.action == 'status':
                return await get_dlq_status_stats(conn)
            
            return fail(f"unknown_action: {input_data.action}")

        return await with_admin_context(conn, operation)

    except Exception as e:
        log("DLQ Processor Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close()


async def main(args: dict[str, object]) -> Result[object]:
    """Windmill entrypoint."""
    return await _main_async(args)

from ._dlq_logic import list_dlq, retry_dlq, resolve_dlq, discard_dlq, get_dlq_status_stats
