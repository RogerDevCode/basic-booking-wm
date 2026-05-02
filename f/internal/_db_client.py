from __future__ import annotations

import os
from typing import TYPE_CHECKING, Protocol, cast

from returns.result import Success

from ._wmill_adapter import get_variable_safe

if TYPE_CHECKING:
    from ._result import DBClient


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

    # 2. Windmill variable (try both scoped and global paths)
    for path in ("u/admin/DATABASE_URL", "g/all/DATABASE_URL", "DATABASE_URL"):
        res = get_variable_safe(path)
        if isinstance(res, Success):
            val = res.unwrap()
            if val:
                return str(val)

    return None


def _extract_dsn_kwargs(db_url: str) -> tuple[str, dict[str, object]]:
    """Strip asyncpg-specific params from DSN query string and return them separately."""
    from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

    _ASYNCPG_PARAMS = frozenset({
        "statement_cache_size", "max_cached_statement_lifetime", "max_cacheable_statement_size"
    })

    parsed = urlparse(db_url)
    kwargs: dict[str, object] = {}

    if parsed.query:
        params = parse_qs(parsed.query, keep_blank_values=True)
        extracted: dict[str, list[str]] = {}
        remaining: dict[str, list[str]] = {}
        for k, v in params.items():
            if k in _ASYNCPG_PARAMS:
                extracted[k] = v
            else:
                remaining[k] = v

        if extracted:
            for k, v in extracted.items():
                kwargs[k] = int(v[0]) if v[0].isdigit() else v[0]
            db_url = urlunparse(parsed._replace(query=urlencode({k: v[0] for k, v in remaining.items()})))

    return db_url, kwargs


async def create_db_client() -> DBClient:
    """
    Factory for database client.
    """
    db_url = _resolve_db_url()
    if not db_url:
        raise RuntimeError("DATABASE_URL not configured")

    import asyncpg

    clean_url, connect_kwargs = _extract_dsn_kwargs(db_url)

    class AsyncpgWrapper:
        def __init__(self, conn: _AsyncpgConn) -> None:
            self.conn = conn

        async def fetch(self, query: str, *args: object) -> list[dict[str, object]]:
            # asyncpg rows are record-like, we convert to dicts
            rows = await self.conn.fetch(query, *args)
            return [dict(r) for r in rows]

        async def fetchrow(self, query: str, *args: object) -> dict[str, object] | None:
            row = await self.conn.fetchrow(query, *args)
            return dict(row) if row else None

        async def fetchval(self, query: str, *args: object) -> object | None:
            return await self.conn.fetchval(query, *args)

        async def execute(self, query: str, *args: object) -> str:
            res = await self.conn.execute(query, *args)
            return str(res)

        async def close(self) -> None:
            await self.conn.close()

    # The actual connection from asyncpg is untyped, so we cast it once at the boundary
    conn = await asyncpg.connect(clean_url, **connect_kwargs)
    wrapped_conn = cast("_AsyncpgConn", conn)
    return cast("DBClient", AsyncpgWrapper(wrapped_conn))
