import os
from typing import Any
import asyncpg # type: ignore[import-untyped, import-not-found]

# ============================================================================
# DB CLIENT — PostgreSQL Connection Abstraction
# ============================================================================
# Implements SOLID-D: Dependency Inversion Principle.
# Scripts depend on this abstraction, not on raw asyncpg calls.
# ============================================================================

async def create_db_client(url: str | None = None, **kwargs: object) -> asyncpg.Connection:
    """
    Creates a configured PostgreSQL client.
    Usage:
        conn = await create_db_client()
        ...
        await conn.close()
    """
    db_url = url or os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL is required")
        
    is_localhost = "localhost" in db_url or "127.0.0.1" in db_url
    
    # Configure default SSL based on localhost
    ssl_ctx: bool | Any
    if "ssl" not in kwargs:
        if is_localhost:
            ssl_ctx = False
        else:
            import ssl
            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE
        kwargs["ssl"] = ssl_ctx

    conn = await asyncpg.connect(db_url, **kwargs) # type: ignore[no-untyped-call]
    return conn # type: ignore[no-any-return]
