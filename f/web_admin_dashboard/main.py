from __future__ import annotations
import asyncio
import os
# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Admin stats and system overview KPIs
# DB Tables Used  : bookings, providers, clients, users, booking_audit
# Concurrency Risk: NO — read-only
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates admin_user_id
# ============================================================================

from typing import Any, Dict
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, fail, with_tenant_context
from ._dashboard_models import InputSchema, AdminDashboardResult
from ._dashboard_logic import fetch_dashboard_stats

MODULE = "web_admin_dashboard"

async def _main_async(args: dict[str, object]) -> Result[AdminDashboardResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context (admin_user_id is the tenant filter for with_tenant_context)
        async def operation() -> Result[AdminDashboardResult]:
            return await fetch_dashboard_stats(conn, input_data)

        return await with_tenant_context(conn, input_data.admin_user_id, operation)

    except Exception as e:
        log("Admin Dashboard Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close()


async def main(args: dict[str, object]) -> Result[AdminDashboardResult]:
    """Windmill entrypoint."""
    return await _main_async(args)
