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
#   "typing-extensions>=4.12.0"
# ]
# ///
from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Final, cast

from beartype import beartype
from returns.result import Failure, Result, Success

from .._redis_client import REDIS_TTL, create_redis_client
from .._wmill_adapter import log
from ._update_models import ConversationUpdateInput, ConversationUpdateResult

MODULE: Final[str] = "conversation_update"


@beartype
async def _update_conversation(
    input_data: ConversationUpdateInput, redis_url: str | None = None
) -> Result[ConversationUpdateResult, str]:
    redis = await create_redis_client(redis_url)
    try:
        key = f"conv:{input_data.chat_id}"

        if input_data.clear:
            await redis.delete(key)
            return Success(ConversationUpdateResult(success=True, chat_id=input_data.chat_id))

        # Atomic update
        async with redis.pipeline(transaction=True):
            raw = await redis.get(key)
            existing = cast("dict[str, object]", json.loads(str(raw)) if raw else {})

            updated = {**existing}
            if input_data.active_flow is not None:
                updated["active_flow"] = input_data.active_flow
            if input_data.flow_step is not None:
                updated["flow_step"] = input_data.flow_step
            if input_data.pending_data is not None:
                existing_pending = cast("dict[str, object]", existing.get("pending_data", {}))
                updated["pending_data"] = {**existing_pending, **input_data.pending_data}
            if input_data.booking_state is not None:
                updated["booking_state"] = input_data.booking_state
            if input_data.booking_draft is not None:
                updated["booking_draft"] = input_data.booking_draft
            if input_data.message_id is not None:
                updated["message_id"] = input_data.message_id

            updated["updated_at"] = datetime.now(UTC).isoformat()

            await redis.set(key, json.dumps(updated), ex=REDIS_TTL)

        return Success(ConversationUpdateResult(success=True, chat_id=input_data.chat_id))

    except Exception as e:
        log("REDIS_UPDATE_ERROR", error=str(e), chat_id=input_data.chat_id, module=MODULE)
        return Failure(f"redis_error: {e}")
    finally:
        await redis.aclose()


async def _main_async(args: object, redis_url: str | None = None) -> dict[str, object]:
    """Windmill entrypoint."""
    if not isinstance(args, dict):
        log("conversation_update skipped: args is not a dict", module=MODULE)
        return {"data": {"success": False, "chat_id": "", "skipped": True, "reason": "invalid_args_type"}}

    try:
        input_data = ConversationUpdateInput.model_validate(args)
    except Exception as e:
        log("conversation_update validation error", error=str(e), module=MODULE)
        return {"data": {"success": False, "chat_id": "", "skipped": True, "reason": "validation_error"}}

    res = await _update_conversation(input_data, redis_url)  # type: ignore[call-arg]
    match res:
        case Success(val):
            return {"data": cast("dict[str, object]", val.model_dump())}
        case Failure(err):
            raise RuntimeError(f"update_failed: {err}")

    return {"data": {"success": False}}


def main(args: object, redis_url: str | None = None) -> dict[str, object]:
    import asyncio
    import traceback

    try:
        return asyncio.run(_main_async(args, redis_url))
    except Exception as e:
        tb = traceback.format_exc()
        try:
            from .._wmill_adapter import log

            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            pass
        raise RuntimeError(f"Execution failed: {e}") from e
