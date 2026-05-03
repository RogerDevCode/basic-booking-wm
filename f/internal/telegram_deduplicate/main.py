# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "httpx>=0.28.1",
#   "pydantic>=2.10.0",
#   "email-validator>=2.2.0",
#   "asyncpg>=0.30.0",
#   "cryptography>=44.0.0",
#   "beartype>=0.19.0",
#   "returns>=0.24.0",
#   "redis>=7.4.0",
#   "typing-extensions>=0.12.0"
# ]
# ///
from __future__ import annotations

from typing import Final

from .._redis_client import create_redis_client
from .._wmill_adapter import log

MODULE: Final[str] = "telegram_deduplicate"

# TTL for dedup keys: 1 hour is sufficient — Telegram retries happen within seconds/minutes
_DEDUP_TTL: Final[int] = 3600


async def _main_async(
    update_id: int | None,
    chat_id: str,
    redis_url: str | None = None,
) -> dict[str, object]:
    if not update_id:
        return {"duplicate": False, "update_id": update_id}

    redis = await create_redis_client(redis_url)
    try:
        key = f"dedup:upd:{update_id}"
        # SET NX — atomically sets only if key doesn't exist
        inserted = await redis.set(key, "1", nx=True, ex=_DEDUP_TTL)
        is_duplicate = inserted is None  # None means key already existed

        if is_duplicate:
            log("DUPLICATE_UPDATE_SKIPPED", update_id=update_id, chat_id=chat_id, module=MODULE)

        return {"duplicate": is_duplicate, "update_id": update_id}
    except Exception as e:
        # On Redis failure, allow processing (fail open — better to double-process than drop)
        log("DEDUP_REDIS_ERROR", error=str(e), update_id=update_id, module=MODULE)
        return {"duplicate": False, "update_id": update_id}
    finally:
        await redis.aclose()


def main(
    update_id: int | None,
    chat_id: str,
    redis_url: str | None = None,
) -> dict[str, object]:
    import asyncio

    return asyncio.run(_main_async(update_id, chat_id, redis_url))
