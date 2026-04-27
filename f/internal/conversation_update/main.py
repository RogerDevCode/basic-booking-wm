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
async def _update_conversation(input_data: ConversationUpdateInput) -> Result[ConversationUpdateResult, str]:
    redis = await create_redis_client()
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


async def main(args: dict[str, object]) -> dict[str, object]:
    """Windmill entrypoint."""
    try:
        input_data = ConversationUpdateInput.model_validate(args)
    except Exception as e:
        raise RuntimeError(f"validation_error: {e}")  # noqa: B904

    res = await _update_conversation(input_data)
    match res:
        case Success(val):
            return {"data": cast("dict[str, object]", val.model_dump())}
        case Failure(err):
            raise RuntimeError(f"update_failed: {err}")

    return {"data": {"success": False}}
