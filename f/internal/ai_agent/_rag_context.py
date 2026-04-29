from typing import TypedDict

from .._db_client import create_db_client


class RAGResult(TypedDict):
    context: str
    count: int
    hasProviderSpecific: bool


async def build_rag_context(provider_id: str | None, text: str, limit: int = 3) -> RAGResult:
    # 1. Fetch relevant FAQs from knowledge_base
    # (Semantic search simplified to keyword search for now as in TS)
    conn = await create_db_client()
    try:
        # Search in public docs OR provider specific docs
        # This uses simple text search for compatibility with the TS version
        rows = await conn.fetch(
            """
            SELECT content, provider_id
            FROM knowledge_base
            WHERE (provider_id IS NULL OR provider_id = $1::uuid)
              AND (content ILIKE $2)
            ORDER BY provider_id DESC NULLS LAST
            LIMIT $3
            """,
            provider_id,
            f"%{text[:20]}%",
            limit,
        )

        if not rows:
            return {"context": "", "count": 0, "hasProviderSpecific": False}

        context_parts = ["<KNOWLEDGE_BASE_CONTEXT>"]
        has_provider = False
        for r in rows:
            context_parts.append(f"- {r['content']}")
            if r["provider_id"]:
                has_provider = True
        context_parts.append("</KNOWLEDGE_BASE_CONTEXT>")

        return {"context": "\n".join(context_parts), "count": len(rows), "hasProviderSpecific": has_provider}
    except Exception as e:
        from .._wmill_adapter import log

        log("SILENT_ERROR_CAUGHT", error=str(e), file="_rag_context.py")
        return {"context": "", "count": 0, "hasProviderSpecific": False}
    finally:
        await conn.close()


async def get_rag_context(provider_id: str | None, text: str) -> str:
    res = await build_rag_context(provider_id, text)
    return res["context"]
