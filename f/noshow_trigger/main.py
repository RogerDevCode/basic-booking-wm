import asyncio
# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Mark expired confirmed bookings as no_show
# DB Tables Used  : providers, bookings, booking_audit
# Concurrency Risk: YES — batch updates
# GCal Calls      : NO
# Idempotency Key : YES — state machine transition is idempotent
# RLS Tenant ID   : YES — with_tenant_context per provider
# Pydantic Schemas: YES — InputSchema validates parameters
# ============================================================================

from typing import Any, Dict, List
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, fail, with_tenant_context
from ._noshow_models import InputSchema, NoShowStats
from ._noshow_logic import BookingRepository

MODULE = "noshow_trigger"

async def _main_async(args: dict[str, Any]) -> Result[NoShowStats]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"validation_error: {e}")

    conn = await create_db_client()
    try:
        # 2. Fetch active providers
        provider_rows = await conn.fetch("SELECT provider_id FROM providers WHERE is_active = True")
        
        aggregate: NoShowStats = {"processed": 0, "marked": 0, "skipped": 0, "booking_ids": []}

        for prow in provider_rows:
            p_id = str(prow["provider_id"])
            
            async def provider_batch() -> Result[NoShowStats]:
                repo = BookingRepository(conn)
                err_fetch, ids = await repo.find_expired_confirmed(input_data.lookback_minutes)
                if err_fetch: return fail(err_fetch)
                if not ids: return ok({"processed": 0, "marked": 0, "skipped": 0, "booking_ids": []})

                marked = 0
                skipped = 0
                processed_ids = []

                for bid in ids:
                    if input_data.dry_run:
                        skipped += 1
                        processed_ids.append(bid)
                        continue
                    
                    err_mark, _ = await repo.mark_as_no_show(bid)
                    if err_mark:
                        log(f"Failed to mark booking {bid} as no-show", error=str(err_mark), module=MODULE)
                        continue
                    
                    marked += 1
                    processed_ids.append(bid)

                return ok({
                    "processed": len(ids),
                    "marked": marked,
                    "skipped": skipped,
                    "booking_ids": processed_ids
                })

            err_p, res_p = await with_tenant_context(conn, p_id, provider_batch)
            if not err_p and res_p:
                aggregate["processed"] += res_p["processed"]
                aggregate["marked"] += res_p["marked"]
                aggregate["skipped"] += res_p["skipped"]
                aggregate["booking_ids"].extend(res_p["booking_ids"])

        return ok(aggregate)

    except Exception as e:
        log("No-Show Trigger Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]


def main(args: dict) -> None:
    import traceback
    try:
        return asyncio.run(_main_async(args))
    except Exception as e:
        tb = traceback.format_exc()
        # Intentamos usar el adaptador local si está disponible, si no print
        try:
            from ..internal._wmill_adapter import log
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=os.path.basename(os.path.dirname(__file__)))
        except:
            from ..internal._wmill_adapter import log
            log("BARE_EXCEPT_CAUGHT", file="main.py")
            print(f"CRITICAL ERROR in {__file__}: {e}\n{tb}")
        
        # Elevamos para que Windmill marque como FAILED
        raise RuntimeError(f"Execution failed: {e}")
