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

# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Search and filter bookings
# DB Tables Used  : bookings, providers, clients, services
# Concurrency Risk: NO — read-only query
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES (if provider_id is supplied, but since it is optional, we might query globally if authorized)
# Zod Schemas     : YES — SearchInput validates all inputs
# ============================================================================
from typing import TYPE_CHECKING

from pydantic import ValidationError

from ..internal._db_client import create_db_client
from ..internal._wmill_adapter import log
from ._search_logic import execute_search
from ._search_models import BookingSearchResult, SearchInput

if TYPE_CHECKING:
    from ..internal._result import Result

MODULE = "booking_search"


async def _main_async(args: dict[str, object]) -> Result[BookingSearchResult]:
    raw_input: object
    if "rawInput" in args:
        raw_input = args["rawInput"]
    else:
        raw_input = args

    try:
        if not isinstance(raw_input, dict):
            raise ValueError("Input must be a JSON object")
        input_data = SearchInput.model_validate(raw_input)
    except ValidationError as e:
        log("Validation error", error=str(e), module=MODULE)
        return Exception(f"Validation error: {e}"), None
    except Exception as e:
        log("Validation error", error=str(e), module=MODULE)
        return Exception(f"Validation error: {e}"), None

    try:
        conn = await create_db_client()
    except Exception as e:
        return Exception(f"CONFIGURATION_ERROR: {e}"), None

    try:
        err, result = await execute_search(conn, input_data)
        if err is not None:
            return err, None

        if not result:
            return Exception("Search failed: no result returned"), None

        return None, result
    except Exception as e:
        msg = str(e)
        log("Internal error", error=msg, module=MODULE)
        return Exception(f"Internal error: {msg}"), None
    finally:
        await conn.close()


def main(args: dict[str, object]) -> Result[BookingSearchResult]:
    import asyncio

    """Windmill entrypoint."""
    return asyncio.run(_main_async(args))
