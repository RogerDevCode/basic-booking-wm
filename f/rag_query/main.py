from __future__ import annotations

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
from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, ok, with_tenant_context
from ..internal._wmill_adapter import log
from ._rag_logic import KBRepository, perform_keyword_search
from ._rag_models import InputSchema, RAGResult

MODULE = "rag_query"


async def _main_async(args: dict[str, object]) -> Result[RAGResult]:
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
                res_empty: RAGResult = {"entries": [], "count": 0, "method": "keyword"}
                return ok(res_empty)

            entries = perform_keyword_search(input_data.query, rows, input_data.top_k)

            res_full: RAGResult = {"entries": entries, "count": len(entries), "method": "keyword"}
            return ok(res_full)

        return await with_tenant_context(conn, input_data.provider_id, operation)

    except Exception as e:
        log("Internal error in rag_query", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close()


async def main(args: dict[str, object]) -> Result[RAGResult]:
    """Windmill entrypoint."""
    return await _main_async(args)
