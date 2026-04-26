from __future__ import annotations
import asyncio
import os
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
from ..internal._result import Result, fail, with_tenant_context
from ._manage_models import InputSchema
from ._manage_logic import (
    handle_provider_actions, handle_service_actions,
    handle_schedule_actions, handle_override_actions
)

MODULE = "provider_manage"

async def _main_async(args: dict[str, object]) -> Result[Dict[str, object]]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"VALIDATION_ERROR: {e}")

    # For list_providers, provider_id might be None initially, but for others it is required
    # However, list_providers usually runs in admin context or with a specific provider filter.
    # If no provider_id, we default to with_admin_context (if needed) or just with_tenant_context with empty
    
    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context (if provider_id supplied)
        async def operation() -> Result[Dict[str, object]]:
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

        # If it's a global action like 'list_providers', we could use a dummy tenant or admin context
        tenant_id = input_data.provider_id or "00000000-0000-0000-0000-000000000000"
        return await with_tenant_context(conn, tenant_id, operation)

    except Exception as e:
        log("Provider Manage Internal Error", error=str(e), module=MODULE)
        return fail(f"INTERNAL_ERROR: {e}")
    finally:
        await conn.close()


def main(args: dict[str, object]) -> Dict[str, object] | None:
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
            print(f"CRITICAL ERROR in provider_manage: {e}\n{tb}")
        
        # Elevamos para que Windmill marque como FAILED
        raise RuntimeError(f"Execution failed: {e}")
