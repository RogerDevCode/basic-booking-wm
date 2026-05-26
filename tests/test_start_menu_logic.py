from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from f.telegram_gateway.worker import process_telegram_update


@pytest.mark.asyncio
async def test_start_command_returns_inline_buttons() -> None:
    # Arrange
    payload = {
        "update_id": 12345,
        "message": {
            "message_id": 1,
            "chat": {"id": 99999, "type": "private"},
            "date": 1600000000,
            "text": "/start",
            "from": {"id": 88888, "first_name": "Test", "username": "testuser"},
        },
    }
    update_json = json.dumps(payload)

    mock_redis = AsyncMock()
    mock_redis.set.return_value = True
    mock_redis.delete.return_value = True

    metrics = AsyncMock()
    ctx = {"redis": mock_redis, "metrics": metrics}

    with (
        patch("f.telegram_gateway.worker.create_db_client", new_callable=AsyncMock),
        patch("f.telegram_gateway.worker._get_conversation", new_callable=AsyncMock) as mock_get_conv,
        patch("f.telegram_gateway.worker.run_telegram_auto_register", new_callable=AsyncMock) as mock_reg,
        patch("f.telegram_gateway.worker.run_ai_agent", new_callable=AsyncMock) as mock_ai,
        patch("f.telegram_gateway.worker.run_conversation_update", new_callable=AsyncMock) as mock_upd,
        patch("f.telegram_gateway.worker.run_telegram_send", new_callable=AsyncMock) as mock_send,
    ):
        mock_reg.return_value = {"client_id": "client-uuid", "phone": "+56999040515", "name": "Test User"}
        from f.internal._conversation_tx import ConversationSnapshot

        mock_get_conv.return_value.data = ConversationSnapshot(
            chat_id="99999",
            active_flow="none",
            version=1,
            booking_state={"name": "idle"},
            booking_draft={},
            pending_data={},
        )
        mock_ai.return_value = {
            "success": True,
            "data": {"intent": "mostrar_menu_principal", "requires_fsm_routing": True},
        }
        mock_upd.return_value = {"success": True}

        # Action
        await process_telegram_update(ctx, update_json)

        # Assert
        mock_send.assert_called_once()
        sent_args = mock_send.call_args[0][0]

        # Verify text is clean (no numbered list)
        print("SENT TEXT:", sent_args["text"])
        assert "📱 *Menú Principal*" in sent_args["text"]
        assert "1️⃣ Agendar" not in sent_args["text"]
        assert "1. 📅 Agendar" not in sent_args["text"]

        # Verify inline buttons are present and numbered
        buttons = sent_args["inline_buttons"]
        assert buttons is not None
        assert len(buttons) == 6
        assert buttons[0][0]["text"] == "1. 📅 Agendar hora"
        assert buttons[1][0]["text"] == "2. 📋 Mis horas"
        assert buttons[5][0]["text"] == "6. 👤 Mis datos"
