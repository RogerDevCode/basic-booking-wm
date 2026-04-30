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
from datetime import UTC, datetime
from typing import Literal

from ..internal._result import Result, fail, ok
from ..internal._wmill_adapter import get_variable
from ._health_logic import check_database, check_gcal, check_gmail, check_telegram
from ._health_models import ComponentStatus, HealthResult, InputSchema

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

    components: list[ComponentStatus] = []

    # 2. Sequential Probes
    if input_data.component in ["all", "database"]:
        components.append(await check_database())

    if input_data.component in ["all", "gcal"]:
        components.append(await check_gcal(gcal_token))

    if input_data.component in ["all", "telegram"]:
        components.append(await check_telegram(tg_token))

    if input_data.component in ["all", "gmail"]:
        components.append(check_gmail(gm_pass))

    # 3. Overall Status
    status_priority = {"unhealthy": 2, "degraded": 1, "healthy": 0, "not_configured": 0}
    max_sev = 0
    for c in components:
        max_sev = max(max_sev, status_priority.get(c["status"], 0))

    overall: Literal["healthy", "unhealthy", "degraded"] = "healthy"
    if max_sev == 2:
        overall = "unhealthy"
    elif max_sev == 1:
        overall = "degraded"

    res: HealthResult = {"overall": overall, "timestamp": datetime.now(UTC).isoformat(), "components": components}
    return ok(res)


def main(args: dict[str, object]) -> Result[HealthResult]:
    import asyncio

    """Windmill entrypoint."""
    return asyncio.run(_main_async(args))
