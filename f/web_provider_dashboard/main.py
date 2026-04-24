# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Provider stats + agenda for today's appointments
# DB Tables Used  : providers, bookings, clients, services
# Concurrency Risk: NO — read-only
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates provider_user_id
# ============================================================================

from typing import Any, Dict
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, fail, with_tenant_context
from ._provider_dashboard_models import InputSchema, DashboardResult
from ._provider_dashboard_logic import fetch_provider_dashboard

MODULE = "web_provider_dashboard"

async def main(args: dict[str, Any]) -> Result[DashboardResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context (provider_user_id)
        async def operation() -> Result[DashboardResult]:
            return await fetch_provider_dashboard(conn, input_data)

        return await with_tenant_context(conn, input_data.provider_user_id, operation)

    except Exception as e:
        log("Provider Dashboard Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]
