from __future__ import annotations
import os
from typing import Any, Optional, List, Dict, cast
from ._wmill_adapter import get_variable_safe
from ._result import DBClient
from returns.result import Success

def _resolve_db_url() -> Optional[str]:
    # 1. Local environment
    local_url = os.getenv("DATABASE_URL")
    if local_url:
        return local_url

    # 2. Windmill variable
    res = get_variable_safe("DATABASE_URL")
    if isinstance(res, Success):
        return str(res.unwrap())
    
    return None

async def create_db_client() -> DBClient:
    """
    Factory for database client.
    """
    db_url = _resolve_db_url()
    if not db_url:
        raise RuntimeError("DATABASE_URL not configured")

    import asyncpg # type: ignore[import-untyped, import-not-found, unused-ignore]
    
    class AsyncpgWrapper:
        def __init__(self, conn: Any) -> None:
            self.conn = conn

        async def fetch(self, query: str, *args: object) -> list[dict[str, object]]:
            # Using cast to Any to avoid 'Expression has type Any' from untyped asyncpg
            conn = cast(Any, self.conn)
            rows = await conn.fetch(query, *args)
            return [dict(r) for r in rows]

        async def fetchrow(self, query: str, *args: object) -> dict[str, object] | None:
            conn = cast(Any, self.conn)
            row = await conn.fetchrow(query, *args)
            return dict(row) if row else None
            
        async def fetchval(self, query: str, *args: object) -> object | None:
            conn = cast(Any, self.conn)
            val: object = await conn.fetchval(query, *args)
            return val

        async def execute(self, query: str, *args: object) -> str:
            conn = cast(Any, self.conn)
            res: str = await conn.execute(query, *args)
            return res

        async def close(self) -> None:
            conn = cast(Any, self.conn)
            await conn.close()

    conn = await asyncpg.connect(db_url)
    return cast(DBClient, AsyncpgWrapper(conn))
