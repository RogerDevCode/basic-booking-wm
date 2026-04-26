from __future__ import annotations

import os
import ssl
from typing import TYPE_CHECKING, cast

import asyncpg  # type: ignore[import-untyped]

if TYPE_CHECKING:
    from ._result import DBClient

# ============================================================================
# DB CLIENT — PostgreSQL Connection Abstraction
# ============================================================================


def _resolve_db_url() -> str | None:
    """Resolves DATABASE_URL from Windmill variables with env fallback."""
    from ._wmill_adapter import get_variable

    for path in ["g/all/DATABASE_URL", "u/admin/DATABASE_URL", "DATABASE_URL"]:
        wm_url = get_variable(path)
        if wm_url:
            return wm_url

    return os.getenv("DATABASE_URL")


async def create_db_client(url: str | None = None, **kwargs: object) -> DBClient:
    """
    Creates a configured PostgreSQL client.
    """
    db_url = url or _resolve_db_url()
    if not db_url:
        raise ValueError(
            "DATABASE_URL is required. "
            "Set wmill variable 'u/admin/DATABASE_URL' (production) "
            "or DATABASE_URL env var (local dev)."
        )

    is_localhost = "localhost" in db_url or "127.0.0.1" in db_url

    new_kwargs: dict[str, object] = dict(kwargs)
    if "ssl" not in new_kwargs:
        if is_localhost or "sslmode=disable" in db_url:
            new_kwargs["ssl"] = False
        else:
            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE
            new_kwargs["ssl"] = ssl_ctx

    # asyncpg.connect returns Any because it's untyped.
    # We cast immediately to DBClient to stop Any contamination.
    conn: DBClient = cast("DBClient", await asyncpg.connect(db_url, **new_kwargs))
    return conn
