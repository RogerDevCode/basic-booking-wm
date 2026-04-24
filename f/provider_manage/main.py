# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : CRUD for providers, services, schedules, and overrides
# DB Tables Used  : providers, services, provider_schedules, schedule_overrides
# Concurrency Risk: NO — atomic operations
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates action and fields
# ============================================================================

from typing import Any, Dict
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, fail, with_tenant_context
from ._manage_models import InputSchema
from ._manage_logic import (
    handle_provider_actions, handle_service_actions,
    handle_schedule_actions, handle_override_actions
)

MODULE = "provider_manage"

async def main(args: dict[str, Any]) -> Result[Dict[str, Any]]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"VALIDATION_ERROR: {e}")

    if not input_data.provider_id:
        return fail("MISSING_FIELDS: provider_id is required for all provider_manage operations")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context
        async def operation() -> Result[Dict[str, Any]]:
            action = input_data.action
            if 'provider' in action:
                return await handle_provider_actions(conn, input_data)
            if 'service' in action:
                return await handle_service_actions(conn, input_data)
            if 'schedule' in action:
                return await handle_schedule_actions(conn, input_data)
            if 'override' in action:
                return await handle_override_actions(conn, input_data)
            
            return fail(f"ROUTING_ERROR: Unknown action group: {action}")

        return await with_tenant_context(conn, input_data.provider_id, operation)

    except Exception as e:
        log("Provider Manage Internal Error", error=str(e), module=MODULE)
        return fail(f"INTERNAL_ERROR: {e}")
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]
