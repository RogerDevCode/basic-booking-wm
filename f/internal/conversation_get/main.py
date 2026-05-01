# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "httpx>=0.28.1",
#   "pydantic>=2.10.0",
#   "email-validator>=2.2.0",
#   "asyncpg>=0.30.0",
#   "cryptography>=44.0.0",
#   "beartype>=0.19.0",
#   "returns>=0.24.0",
#   "redis>=7.4.0",
#   "typing-extensions>=4.12.0"
# ]
# ///
from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Final, cast

from beartype import beartype
from returns.result import Failure, Result, Success

from .._redis_client import create_redis_client
from .._wmill_adapter import log
from ._conversation_models import ConversationGetResult, ConversationState

MODULE: Final[str] = "conversation_get"


@beartype
async def _get_conversation(chat_id: str, redis_url: str | None = None) -> Result[ConversationGetResult, str]:
    redis = await create_redis_client(redis_url)
    try:
        key = f"conv:{chat_id}"
        raw = await redis.get(key)

        if not raw:
            return Success(ConversationGetResult(data=None))

        try:
            data = cast("dict[str, object]", json.loads(str(raw)))
            # Basic validation/mapping
            state = ConversationState(
                chat_id=chat_id,
                active_flow=cast("str | None", data.get("active_flow")),
                flow_step=cast("int", data.get("flow_step", 0)),
                pending_data=cast("dict[str, object]", data.get("pending_data", {})),
                booking_state=cast("dict[str, object] | None", data.get("booking_state")),
                booking_draft=cast("dict[str, object] | None", data.get("booking_draft")),
                message_id=cast("int | None", data.get("message_id")),
                updated_at=cast("str", data.get("updated_at", datetime.now(UTC).isoformat())),
            )
            return Success(ConversationGetResult(data=state))
        except Exception as e:
            log("CONVERSATION_PARSE_ERROR", error=str(e), chat_id=chat_id, module=MODULE)
            return Success(ConversationGetResult(data=None))

    except Exception as e:
        log("REDIS_GET_ERROR", error=str(e), chat_id=chat_id, module=MODULE)
        return Failure(f"redis_error: {e}")
    finally:
        await redis.aclose()


async def _main_async(chat_id: str, redis_url: str | None = None) -> dict[str, object]:
    """Windmill entrypoint."""
    res = await _get_conversation(chat_id, redis_url)  # type: ignore[call-arg]
    match res:
        case Success(val):
            return cast("dict[str, object]", val.model_dump())
        case Failure(err):
            # Graceful degradation: return empty state on redis failure but log it
            return {"data": None, "error": str(err)}

    return {"data": None}


def main(chat_id: str, redis_url: str | None = None) -> dict[str, object]:
    import asyncio
    import traceback

    try:
        return asyncio.run(_main_async(chat_id, redis_url))
    except Exception as e:
        tb = traceback.format_exc()
        try:
            from .._wmill_adapter import log

            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            pass
        raise RuntimeError(f"Execution failed: {e}") from e
