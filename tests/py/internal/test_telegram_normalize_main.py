from __future__ import annotations

import pytest

from f.internal.telegram_normalize._normalize_models import TelegramNormalizeInput
from f.internal.telegram_normalize.main import _main_async, main


@pytest.mark.asyncio
async def test_main_async_marks_text_message_as_processable() -> None:
    result = await _main_async(
        TelegramNormalizeInput(
            chat_id="123",
            text="  hola  ",
            username="user1",
        )
    )

    assert result.processable is True
    assert result.event_kind == "message"
    assert result.normalized_text == "hola"


@pytest.mark.asyncio
async def test_main_async_marks_callback_as_non_processable() -> None:
    result = await _main_async(
        TelegramNormalizeInput(
            chat_id="123",
            text="",
            username="user1",
            callback_data="book:1",
            callback_query_id="cb_1",
        )
    )

    assert result.processable is False
    assert result.event_kind == "callback"
    assert result.normalized_text == ""


def test_main_accepts_plain_dict() -> None:
    result = main(
        {
            "chat_id": "123",
            "text": " hola ",
            "username": "user1",
            "callback_data": None,
            "callback_query_id": None,
            "callback_message_id": None,
        }
    )

    assert result == {
        "processable": True,
        "event_kind": "message",
        "chat_id": "123",
        "normalized_text": "hola",
        "username": "user1",
        "callback_data": None,
        "callback_query_id": None,
        "callback_message_id": None,
    }
