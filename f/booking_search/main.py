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

from typing import Any, cast
from pydantic import ValidationError
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ._search_models import SearchInput, BookingSearchResult
from ._search_logic import execute_search

MODULE = "booking_search"

async def main(args: object) -> tuple[Exception | None, BookingSearchResult | None]:
    raw_input: Any
    if isinstance(args, dict) and "rawInput" in args:
        raw_input = cast(Any, args["rawInput"])
    else:
        raw_input = cast(Any, args)

    try:
        if not isinstance(raw_input, dict):
            raise ValueError("Input must be a JSON object")
        input_data = SearchInput.model_validate(raw_input)
    except ValidationError as e:
        log("Validation error", error=str(e), module=MODULE)
        return (Exception(f"Validation error: {e}"), None)
    except Exception as e:
        log("Validation error", error=str(e), module=MODULE)
        return (Exception(f"Validation error: {e}"), None)

    try:
        conn = await create_db_client()
    except Exception as e:
        return (Exception(f"CONFIGURATION_ERROR: {e}"), None)

    try:
        err, result = await execute_search(conn, input_data)
        if err is not None:
            return (err, None)
            
        return (None, result)
    except Exception as e:
        msg = str(e)
        log("Internal error", error=msg, module=MODULE)
        return (Exception(f"Internal error: {msg}"), None)
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]
