import asyncio

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
from typing import Any

from ..internal._db_client import create_db_client
from ..internal._result import Result, fail
from ..internal._wmill_adapter import log
from ._regions_logic import list_communes, list_regions, search_communes
from ._regions_models import InputSchema

MODULE = "web_admin_regions"


async def _main_async(args: dict[str, Any]) -> Result[Any]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        if input_data.action == "list_regions":
            return await list_regions(conn)

        elif input_data.action == "list_communes":
            return await list_communes(conn, input_data.region_id)

        elif input_data.action == "search_communes":
            return await search_communes(conn, input_data.search or "", input_data.region_id)

        return fail(f"Unsupported action: {input_data.action}")

    except Exception as e:
        log("Admin Regions Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close()  # pyright: ignore[reportUnknownMemberType]


def main(args: dict[str, Any]) -> Result[Any]:
    import traceback

    try:
        return asyncio.run(_main_async(args))
    except Exception as e:
        tb = traceback.format_exc()
        # Intentamos usar el adaptador local si está disponible, si no print
        try:
            from ..internal._wmill_adapter import log

            log(
                "CRITICAL_ENTRYPOINT_ERROR",
                error=str(e),
                traceback=tb,
                module=MODULE,
            )
        except Exception:
            from ..internal._wmill_adapter import log

            log("BARE_EXCEPT_CAUGHT", file="main.py")
            print(f"CRITICAL ERROR in {__file__}: {e}\n{tb}")

        # Elevamos para que Windmill marque como FAILED
        raise RuntimeError(f"Execution failed: {e}") from e
