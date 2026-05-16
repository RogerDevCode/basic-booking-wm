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

from .._redis_client import REDIS_TTL, create_redis_client
from .._wmill_adapter import log
from ._update_models import ConversationUpdateInput, ConversationUpdateResult

MODULE: Final[str] = "conversation_update"


@beartype
async def _update_conversation(
    input_data: ConversationUpdateInput, redis_url: str | None = None
) -> ConversationUpdateResult:
    redis = await create_redis_client(redis_url)
    try:
        key = f"conv:{input_data.chat_id}"

        if input_data.clear:
            await redis.delete(key)
            return ConversationUpdateResult(success=True, chat_id=input_data.chat_id)

        # Atomic update via Lua script to prevent race conditions
        lua_script = """
        local key = KEYS[1]
        local ttl = ARGV[1]
        local updates = cjson.decode(ARGV[2])

        local raw = redis.call('GET', key)
        local existing = {}
        if raw and raw ~= false then
            existing = cjson.decode(raw)
        end

        for k, v in pairs(updates) do
            if k == 'pending_data' and type(v) == 'table' then
                local pending = existing['pending_data']
                if type(pending) ~= 'table' then
                    pending = {}
                end
                for pk, pv in pairs(v) do
                    pending[pk] = pv
                end
                existing['pending_data'] = pending
            else
                existing[k] = v
            end
        end

        local result = cjson.encode(existing)
        redis.call('SET', key, result, 'EX', ttl)
        return 1
        """

        updates: dict[str, object] = {}
        if input_data.active_flow is not None:
            updates["active_flow"] = input_data.active_flow
        if input_data.flow_step is not None:
            updates["flow_step"] = input_data.flow_step
        if input_data.pending_data is not None:
            updates["pending_data"] = input_data.pending_data
        if input_data.booking_state is not None:
            updates["booking_state"] = input_data.booking_state
        if input_data.booking_draft is not None:
            updates["booking_draft"] = input_data.booking_draft
        if input_data.message_id is not None:
            updates["message_id"] = input_data.message_id

        updates["updated_at"] = datetime.now(UTC).isoformat()

        await redis.eval(lua_script, 1, key, REDIS_TTL, json.dumps(updates))  # type: ignore[misc]

        return ConversationUpdateResult(success=True, chat_id=input_data.chat_id)

    except Exception as e:
        log("REDIS_UPDATE_ERROR", error=str(e), chat_id=input_data.chat_id, module=MODULE)
        raise RuntimeError(f"redis_error: {e}") from e
    finally:
        await redis.aclose()


async def _main_async(args: object, redis_url: str | None = None) -> dict[str, object]:
    """Windmill entrypoint."""
    if not isinstance(args, dict):
        raise RuntimeError("conversation_update failed: args is not a dict")

    try:
        input_data = ConversationUpdateInput.model_validate(args)
    except Exception as e:
        raise RuntimeError(f"conversation_update validation error: {e}") from e

    result = await _update_conversation(input_data, redis_url)  # type: ignore[call-arg]
    return {"data": cast("dict[str, object]", result.model_dump())}


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
