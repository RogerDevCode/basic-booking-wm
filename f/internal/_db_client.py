from __future__ import annotations

import os
from typing import Protocol, cast

from ._result import DBClient  # noqa: TC001
from ._wmill_adapter import get_variable


class _AsyncpgConn(Protocol):
    """Internal protocol to contain Any leakage from asyncpg."""

    async def fetch(self, query: str, *args: object) -> list[dict[str, object]]: ...

    async def fetchrow(self, query: str, *args: object) -> dict[str, object] | None: ...

    async def fetchval(self, query: str, *args: object) -> object | None: ...

    async def execute(self, query: str, *args: object) -> str: ...

    async def close(self) -> None: ...


def _resolve_db_url() -> str | None:
    # 1. Local environment
    local_url = os.getenv("DATABASE_URL")
    if local_url:
        return local_url

    # 2. Windmill variables (Priority order)
    # Added g/all/ paths which are standard for shared variables
    paths = [
        "g/all/DATABASE_URL",
        "u/admin/DATABASE_URL",
        "DATABASE_URL",
        "f/internal/db_url",
    ]
    for path in paths:
        res = get_variable(path)
        if res is not None:
            return res

    return None


async def create_db_client() -> DBClient:
    """
    Factory for database client.
    """
    db_url = _resolve_db_url()
    if not db_url:
        raise RuntimeError(
            "DATABASE_URL is required. Set wmill variable 'g/all/DATABASE_URL' or 'u/admin/DATABASE_URL'."
        )

    import asyncpg

    class AsyncpgWrapper:
        def __init__(self, conn: _AsyncpgConn) -> None:
            self.conn = conn

        async def fetch(self, query: str, *args: object) -> list[dict[str, object]]:
            rows = await self.conn.fetch(query, *args)
            return [dict(r) for r in rows]

        async def fetchrow(self, query: str, *args: object) -> dict[str, object] | None:
            row = await self.conn.fetchrow(query, *args)
            return dict(row) if row else None

        async def fetchval(self, query: str, *args: object) -> object | None:
            val = await self.conn.fetchval(query, *args)
            return val

        async def execute(self, query: str, *args: object) -> str:
            res: str = await self.conn.execute(query, *args)
            return res

        async def close(self) -> None:
            await self.conn.close()

    conn = await asyncpg.connect(db_url)
    wrapped_conn = cast("_AsyncpgConn", cast("object", conn))
    return cast("DBClient", AsyncpgWrapper(wrapped_conn))
