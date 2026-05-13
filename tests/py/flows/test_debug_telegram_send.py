from __future__ import annotations

import pytest

from f.flows.telegram_webhook__flow.debug_telegram_send import _main_async


@pytest.mark.asyncio
async def test_debug_telegram_send_captures_basic_fields() -> None:
    result = await _main_async(
        {
            "chat_id": "123456789",
            "text": "Hola, esta es una prueba de mensaje",
            "mode": "send_message",
            "handled": True,
            "response_text": "Hola, esta es una prueba de mensaje",
        }
    )

    assert result["captured"] is True
    assert "123456789" in result["debug_text"]
    assert "send" in result["debug_text"]
    assert "Si" in result["debug_text"]


@pytest.mark.asyncio
async def test_debug_telegram_send_captures_edit_mode() -> None:
    result = await _main_async(
        {
            "chat_id": "987654321",
            "text": "Mensaje editado",
            "mode": "edit_message",
            "message_id": 42,
            "handled": True,
        }
    )

    assert result["captured"] is True
    assert "edit" in result["debug_text"]
    assert "msg_id: 42" in result["debug_text"]


@pytest.mark.asyncio
async def test_debug_telegram_send_truncates_long_text() -> None:
    long_text = "A" * 500
    result = await _main_async(
        {
            "chat_id": "111",
            "text": long_text,
            "mode": "send_message",
            "handled": False,
        }
    )

    assert result["captured"] is True
    assert "..." in result["debug_text"]
    assert len(result["debug_text"]) < 500


@pytest.mark.asyncio
async def test_debug_telegram_send_handles_inline_buttons() -> None:
    import json

    buttons = json.dumps(
        [
            [{"text": "Opción 1", "callback_data": "opt1"}],
            [{"text": "Opción 2", "callback_data": "opt2"}],
        ]
    )
    result = await _main_async(
        {
            "chat_id": "222",
            "text": "Elige una opción",
            "mode": "send_message",
            "inline_buttons": buttons,
            "handled": True,
        }
    )

    assert result["captured"] is True
    assert "2 botones" in result["debug_text"]


@pytest.mark.asyncio
async def test_debug_telegram_send_handles_missing_fields() -> None:
    result = await _main_async({})

    assert result["captured"] is True
    assert "unknown" in result["debug_text"]
