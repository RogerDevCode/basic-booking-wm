from __future__ import annotations
import asyncio
import os
# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : System health monitoring (DB, GCal, Telegram, Gmail)
# DB Tables Used  : NONE — connectivity only
# Concurrency Risk: NO
# GCal Calls      : YES — probe
# Idempotency Key : N/A
# RLS Tenant ID   : NO
# Pydantic Schemas: YES — InputSchema validates optional filter
# ============================================================================

from datetime import datetime, timezone
from typing import Any, List, Literal
from ..internal._wmill_adapter import log, get_variable
from ..internal._result import Result, ok, fail
from ._health_models import InputSchema, HealthResult, ComponentStatus
from ._health_logic import check_database, check_gcal, check_telegram, check_gmail

MODULE = "health_check"

async def _main_async(args: dict[str, object]) -> Result[HealthResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    gcal_token = str(get_variable("GCAL_ACCESS_TOKEN")) if get_variable("GCAL_ACCESS_TOKEN") else None
    tg_token = str(get_variable("TELEGRAM_BOT_TOKEN")) if get_variable("TELEGRAM_BOT_TOKEN") else None
    gm_pass = os.getenv("GMAIL_PASSWORD")

    components: List[ComponentStatus] = []

    # 2. Sequential Probes
    if input_data.component in ['all', 'database']:
        components.append(await check_database())

    if input_data.component in ['all', 'gcal']:
        components.append(await check_gcal(gcal_token))

    if input_data.component in ['all', 'telegram']:
        components.append(await check_telegram(tg_token))

    if input_data.component in ['all', 'gmail']:
        components.append(check_gmail(gm_pass))

    # 3. Overall Status
    status_priority = {'unhealthy': 2, 'degraded': 1, 'healthy': 0, 'not_configured': 0}
    max_sev = 0
    for c in components:
        max_sev = max(max_sev, status_priority.get(c["status"], 0))
    
    overall: Literal['healthy', 'unhealthy', 'degraded'] = 'healthy'
    if max_sev == 2: overall = 'unhealthy'
    elif max_sev == 1: overall = 'degraded'

    res: HealthResult = {
        "overall": overall,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "components": components
    }
    return ok(res)


async def main(args: dict[str, object]) -> Result[HealthResult]:
    """Windmill entrypoint."""
    return await _main_async(args)
