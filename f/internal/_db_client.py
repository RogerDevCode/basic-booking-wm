import os
import ssl

import asyncpg  # type: ignore[import-untyped, import-not-found]

# ============================================================================
# DB CLIENT — PostgreSQL Connection Abstraction
# ============================================================================
# Implements SOLID-D: Dependency Inversion Principle.
# Scripts depend on this abstraction, not on raw asyncpg calls.
#
# DB URL resolution priority:
#   1. Explicit `url` argument
#   2. wmill.get_variable("u/admin/DATABASE_URL")  — Windmill production
#   3. os.getenv("DATABASE_URL")                   — local dev fallback
# ============================================================================


def _resolve_db_url() -> str | None:
    """Resolves DATABASE_URL from Windmill variables with env fallback."""
    from ._wmill_adapter import get_variable  # local import avoids circular deps

    # Try Windmill variable first (production path)
    wm_url = get_variable("u/admin/DATABASE_URL")
    if wm_url:
        return wm_url
    # Fallback for local development
    return os.getenv("DATABASE_URL")


async def create_db_client(url: str | None = None, **kwargs: object) -> asyncpg.Connection:
    """
    Creates a configured PostgreSQL client.
    Usage:
        conn = await create_db_client()
        ...
        await conn.close()
    """
    db_url = url or _resolve_db_url()
    if not db_url:
        raise ValueError(
            "DATABASE_URL is required. "
            "Set wmill variable 'u/admin/DATABASE_URL' (production) "
            "or DATABASE_URL env var (local dev)."
        )

    is_localhost = "localhost" in db_url or "127.0.0.1" in db_url

    # Configure default SSL based on localhost
    ssl_ctx: object
    if "ssl" not in kwargs:
        if is_localhost:
            ssl_ctx = False
        else:
            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False  # type: ignore[union-attr]
            ssl_ctx.verify_mode = ssl.CERT_NONE  # type: ignore[union-attr]
        kwargs["ssl"] = ssl_ctx

    conn = await asyncpg.connect(db_url, **kwargs)  # type: ignore[no-untyped-call]
    return conn  # type: ignore[no-any-return]
