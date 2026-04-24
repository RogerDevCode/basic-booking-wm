# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Read-only reference data for regions and communes
# DB Tables Used  : regions, communes
# Concurrency Risk: NO
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : NO — public reference data
# Pydantic Schemas: YES — InputSchema validates action and region_id
# ============================================================================

from typing import Any, Dict
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, fail
from ._regions_models import InputSchema
from ._regions_logic import list_regions, list_communes, search_communes

MODULE = "web_admin_regions"

async def main(args: dict[str, Any]) -> Result[Any]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        if input_data.action == 'list_regions':
            return await list_regions(conn)
        
        elif input_data.action == 'list_communes':
            return await list_communes(conn, input_data.region_id)
            
        elif input_data.action == 'search_communes':
            return await search_communes(conn, input_data.search or '', input_data.region_id)
        
        return fail(f"Unsupported action: {input_data.action}")

    except Exception as e:
        log("Admin Regions Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]
