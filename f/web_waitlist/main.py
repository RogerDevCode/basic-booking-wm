# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Waitlist management (join, leave, list, check position)
# DB Tables Used  : waitlist, clients, users, services
# Concurrency Risk: YES — handled via SELECT FOR UPDATE on service_id during join
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates action and fields
# ============================================================================

from typing import Any, Dict, cast
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, fail, with_tenant_context
from ._waitlist_models import InputSchema, WaitlistResult
from ._waitlist_logic import resolve_client_id, handle_join, handle_leave, handle_list, handle_check_position

MODULE = "web_waitlist"

async def main(args: dict[str, Any]) -> Result[WaitlistResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"validation_error: {e}")

    conn = await create_db_client()
    try:
        tenant_id = input_data.client_id or input_data.user_id

        # 2. Execute within Tenant Context
        async def operation() -> Result[WaitlistResult]:
            # 2.1 Resolve Identity
            err_id, client_id = await resolve_client_id(conn, input_data.user_id, input_data.client_id)
            if err_id or not client_id: return fail(err_id or "unresolved_client")

            # 2.2 Dispatch Action
            action = input_data.action
            if action == 'join':
                return await handle_join(conn, client_id, input_data)
            elif action == 'leave':
                return await handle_leave(conn, client_id, input_data.waitlist_id)
            elif action == 'list':
                return await handle_list(conn, client_id)
            elif action == 'check_position':
                return await handle_check_position(conn, client_id, input_data.waitlist_id)
            
            return fail(f"unsupported_action: {action}")

        return await with_tenant_context(conn, tenant_id, operation)

    except Exception as e:
        log("Web Waitlist Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]
