import asyncio
# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Semantic search against knowledge base (keyword-based fallback)
# DB Tables Used  : knowledge_base
# Concurrency Risk: NO — read-only
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates query and top_k
# ============================================================================

from typing import Any, Dict, cast
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import with_tenant_context, Result, ok, fail
from ._rag_models import InputSchema, RAGResult
from ._rag_logic import KBRepository, perform_keyword_search

MODULE = "rag_query"

async def _main_async(args: dict[str, Any]) -> Result[RAGResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"validation_error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context
        async def operation() -> Result[RAGResult]:
            repo = KBRepository(conn)
            
            err_fetch, rows = await repo.fetch_active_entries(input_data.category)
            if err_fetch:
                return fail(err_fetch)

            if not rows:
                return ok({"entries": [], "count": 0, "method": "keyword"})

            entries = perform_keyword_search(input_data.query, rows, input_data.top_k)
            
            return ok({
                "entries": entries,
                "count": len(entries),
                "method": "keyword"
            })

        return await with_tenant_context(conn, input_data.provider_id, operation)

    except Exception as e:
        log("Internal error in rag_query", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]


def main(args: dict):
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
