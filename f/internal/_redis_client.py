from __future__ import annotations

import os
from typing import Final

from redis.asyncio import Redis
from returns.result import Success

from ._wmill_adapter import get_variable_safe

# ============================================================================
# REDIS CLIENT — Single Source of Truth for Redis connections
# ============================================================================

REDIS_TTL: Final[int] = 1800  # 30 minutes


def _resolve_redis_url() -> str | None:
    # 1. Local environment
    local_url = os.getenv("REDIS_URL")
    if local_url:
        return local_url

    # 2. Windmill variable
    res = get_variable_safe("REDIS_URL")
    if isinstance(res, Success):
        return str(res.unwrap())

    return None


async def create_redis_client() -> Redis:  # type: ignore[type-arg]
    """
    Factory for Redis client.
    """
    redis_url = _resolve_redis_url()
    if not redis_url:
        # Default for local docker-compose
        redis_url = "redis://redis:6379"

    # Use Redis.from_url. We suppress type-arg because redis-py async types
    # are problematic in some environments/stubs.
    return Redis.from_url(redis_url, decode_responses=True)  # type: ignore[no-any-return]
