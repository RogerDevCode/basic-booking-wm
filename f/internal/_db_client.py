from __future__ import annotations

import os
from typing import Protocol, cast

from returns.result import Success

from ._result import DBClient
from ._wmill_adapter import get_variable_safe


class _AsyncpgConn(Protocol):
    """Internal protocol to contain Any leakage from asyncpg."""

    async def fetch(self, query: str, *args: object) -> list[dict[str, object]]:
        ...

    async def fetchrow(self, query: str, *args: object) -> dict[str, object] | None:
        ...

    async def fetchval(self, query: str, *args: object) -> object | None:
        ...

    async def execute(self, query: str, *args: object) -> str:
        ...

    async def close(self) -> None:
        ...


def _resolve_db_url() -> str | None:
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

    import asyncpg  # type: ignore[import-untyped]

    class AsyncpgWrapper:
        def __init__(self, conn: _AsyncpgConn) -> None:
            self.conn = conn

        async def fetch(self, query: str, *args: object) -> list[dict[str, object]]:
            # asyncpg rows are record-like, we convert to dicts
            # Use cast to satisfy protocol even if asyncpg is untyped
            rows = await self.conn.fetch(query, *args)
            return [dict(r) for r in cast(list[dict[str, object]], rows)]

        async def fetchrow(self, query: str, *args: object) -> dict[str, object] | None:
            row = await self.conn.fetchrow(query, *args)
            return dict(row) if row else None

        async def fetchval(self, query: str, *args: object) -> object | None:
            val = await self.conn.fetchval(query, *args)
            return cast(object, val)

        async def execute(self, query: str, *args: object) -> str:
            res = await self.conn.execute(query, *args)
            return str(res)

        async def close(self) -> None:
            await self.conn.close()

    # The actual connection from asyncpg is untyped, so we cast it once at the boundary
    conn = await asyncpg.connect(db_url)
    # Double cast to object then protocol to satisfy mypy's strictness about untyped asyncpg return
    wrapped_conn = cast(_AsyncpgConn, cast(object, conn))
    return cast(DBClient, AsyncpgWrapper(wrapped_conn))
