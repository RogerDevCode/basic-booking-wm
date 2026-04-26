from __future__ import annotations
import asyncio
import json
from datetime import datetime, timezone
from typing import Optional, cast, Dict, Final
from beartype import beartype
from returns.result import Result, Success, Failure
from .._wmill_adapter import log
from .._redis_client import create_redis_client
from ._conversation_models import ConversationState, ConversationGetResult

MODULE: Final[str] = "conversation_get"

@beartype
async def _get_conversation(chat_id: str) -> Result[ConversationGetResult, str]:
    redis = await create_redis_client()
    try:
        key = f"conv:{chat_id}"
        raw = await redis.get(key)
        
        if not raw:
            return Success(ConversationGetResult(data=None))
        
        try:
            data = cast(Dict[str, object], json.loads(str(raw)))
            # Basic validation/mapping
            state = ConversationState(
                chat_id=chat_id,
                active_flow=cast(Optional[str], data.get("active_flow")),
                flow_step=cast(int, data.get("flow_step", 0)),
                pending_data=cast(Dict[str, object], data.get("pending_data", {})),
                booking_state=cast(Optional[Dict[str, object]], data.get("booking_state")),
                booking_draft=cast(Optional[Dict[str, object]], data.get("booking_draft")),
                message_id=cast(Optional[int], data.get("message_id")),
                updated_at=cast(str, data.get("updated_at", datetime.now(timezone.utc).isoformat()))
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


async def main(chat_id: str) -> dict[str, object]:
    """Windmill entrypoint."""
    res = await _get_conversation(chat_id)
    match res:
        case Success(val):
            return cast(dict[str, object], val.model_dump())
        case Failure(err):
            # Graceful degradation: return empty state on redis failure but log it
            return {"data": None, "error": str(err)}
    
    return {"data": None}
