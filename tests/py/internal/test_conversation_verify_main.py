from __future__ import annotations

import pytest

from f.internal.conversation_verify._verify_models import ConversationVerifyInput, PersistedConversationState
from f.internal.conversation_verify.main import _main_async, main


@pytest.mark.asyncio
async def test_main_async_returns_success_on_matching_state() -> None:
    input_data = ConversationVerifyInput(
        expected_chat_id="123",
        expected_echo_count=2,
        persisted_state=PersistedConversationState(
            chat_id="123",
            flow_step=0,
            pending_data={"echo_count": 2},
            updated_at="2026-04-30T00:00:00+00:00",
        ),
    )

    result = await _main_async(input_data)

    assert result.success is True
    assert result.verified_chat_id == "123"
    assert result.verified_echo_count == 2


@pytest.mark.asyncio
async def test_main_async_raises_on_mismatched_counter() -> None:
    input_data = ConversationVerifyInput(
        expected_chat_id="123",
        expected_echo_count=2,
        persisted_state=PersistedConversationState(
            chat_id="123",
            flow_step=0,
            pending_data={"echo_count": 1},
            updated_at="2026-04-30T00:00:00+00:00",
        ),
    )

    with pytest.raises(RuntimeError, match="echo_count_mismatch"):
        await _main_async(input_data)


def test_main_accepts_plain_dict() -> None:
    result = main(
        {
            "expected_chat_id": "123",
            "expected_echo_count": 3,
            "persisted_state": {
                "chat_id": "123",
                "flow_step": 0,
                "pending_data": {"echo_count": 3},
                "updated_at": "2026-04-30T00:00:00+00:00",
            },
        }
    )

    assert result == {"success": True, "verified_chat_id": "123", "verified_echo_count": 3}
