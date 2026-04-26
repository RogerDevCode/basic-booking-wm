from __future__ import annotations
from typing import List, Optional, cast, Dict, Any, TypedDict
from ..internal._result import Result, DBClient, ok, fail
from ._rag_models import KBRow, KBEntry

class KBRepository:
    def __init__(self, db: DBClient) -> None:
        self.db = db

    async def fetch_active_entries(self, category: Optional[str] = None) -> Result[List[KBRow]]:
        try:
            if category:
                rows = await self.db.fetch(
                    """
                    SELECT kb_id, category, title, content
                    FROM knowledge_base
                    WHERE category = $1 AND is_active = true
                    """,
                    category
                )
            else:
                rows = await self.db.fetch(
                    """
                    SELECT kb_id, category, title, content
                    FROM knowledge_base
                    WHERE is_active = true
                    """
                )
            
            # Map asyncpg rows to TypedDict
            result: List[KBRow] = [
                {
                    "kb_id": str(r["kb_id"]),
                    "category": str(r["category"]),
                    "title": str(r["title"]),
                    "content": str(r["content"])
                }
                for r in rows
            ]
            return ok(result)
        except Exception as e:
            return fail(f"kb_fetch_failed: {e}")

class ScoredEntry(TypedDict):
    entry: KBEntry
    score: int

def perform_keyword_search(
    query: str,
    entries: List[KBRow],
    top_k: int
) -> List[KBEntry]:
    terms = [t for t in query.lower().split() if len(t) > 2]
    if not terms:
        return []

    scored_entries: List[ScoredEntry] = []
    for row in entries:
        title = row["title"].lower()
        content = row["content"].lower()
        category = row["category"].lower()
        
        score = 0
        for term in terms:
            if term in title: score += 3
            if term in content: score += 1
            if term in category: score += 2
        
        if score > 0:
            similarity = float(min(score / (len(terms) * 3), 1.0))
            entry: KBEntry = {
                "kb_id": row["kb_id"],
                "category": row["category"],
                "title": row["title"],
                "content": row["content"],
                "similarity": similarity
            }
            scored_entries.append({
                "entry": entry,
                "score": score
            })

    # Sort and slice
    scored_entries.sort(key=lambda x: x["score"], reverse=True)
    return [s["entry"] for s in scored_entries[:top_k]]
