from __future__ import annotations

import os
from typing import Final

from redis.asyncio import Redis

# ============================================================================
# REDIS CLIENT — Single Source of Truth for Redis connections
# ============================================================================

REDIS_TTL: Final[int] = 1800  # 30 minutes


def _resolve_redis_url(injected_url: str | None = None) -> str | None:
    # 1. Injected parameter (highest priority)
    if injected_url:
        return injected_url

    # 2. Local environment
    local_url = os.getenv("REDIS_URL")
    if local_url:
        return local_url

    return None


async def create_redis_client(redis_url: str | None = None) -> Redis:
    """
    Factory for Redis client.
    """
    resolved_url = _resolve_redis_url(redis_url)
    if not resolved_url:
        resolved_url = "redis://redis:6379"
    elif not resolved_url.startswith(("redis://", "rediss://", "unix://")):
        resolved_url = f"redis://{resolved_url}"

    return Redis.from_url(resolved_url, decode_responses=True)
