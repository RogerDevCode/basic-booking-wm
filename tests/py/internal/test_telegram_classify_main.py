from __future__ import annotations

import pytest

from f.internal.telegram_classify._classify_models import TelegramClassifyInput
from f.internal.telegram_classify.main import _main_async, main


@pytest.mark.asyncio
async def test_main_async_classifies_start_command() -> None:
    result = await _main_async(
        TelegramClassifyInput(
            processable=True,
            event_kind="message",
            chat_id="123",
            normalized_text="/start",
            username="user1",
        )
    )

    assert result.should_process is True
    assert result.text_kind == "command_start"
    assert result.canonical_text == "/start"


@pytest.mark.asyncio
async def test_main_async_classifies_plain_text() -> None:
    result = await _main_async(
        TelegramClassifyInput(
            processable=True,
            event_kind="message",
            chat_id="123",
            normalized_text="hola",
            username="user1",
        )
    )

    assert result.should_process is True
    assert result.text_kind == "plain_text"
    assert result.canonical_text == "hola"


@pytest.mark.asyncio
async def test_main_async_skips_callback() -> None:
    result = await _main_async(
        TelegramClassifyInput(
            processable=False,
            event_kind="callback",
            chat_id="123",
            normalized_text="",
            username="user1",
            callback_data="book:1",
        )
    )

    assert result.should_process is False
    assert result.text_kind == "callback"


def test_main_accepts_plain_dict() -> None:
    result = main(
        {
            "processable": True,
            "event_kind": "message",
            "chat_id": "123",
            "normalized_text": "/help",
            "username": "user1",
            "callback_data": None,
            "callback_query_id": None,
            "callback_message_id": None,
        }
    )

    assert result == {
        "should_process": True,
        "text_kind": "command_other",
        "chat_id": "123",
        "canonical_text": "/help",
        "username": "user1",
    }
