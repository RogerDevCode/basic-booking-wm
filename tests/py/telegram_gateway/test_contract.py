from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from f.telegram_gateway.main import main


@pytest.mark.asyncio
async def test_telegram_gateway_message_routing() -> None:
    # Mock bot token and repo
    with (
        patch("f.telegram_gateway.main.get_variable", return_value="fake-token"),
        patch(
            "f.telegram_gateway._gateway_logic.ClientRepository.ensure_registered", AsyncMock(return_value=(None, None))
        ),
    ):
        # Mock Telegram API call
        with patch("f.telegram_gateway._gateway_logic.httpx.AsyncClient") as mock_client_class:
            mock_client = mock_client_class.return_value.__aenter__.return_value
            mock_client.post.return_value = MagicMock(status_code=200, json=lambda: {"ok": True})

            args = {
                "update_id": 1,
                "message": {
                    "message_id": 100,
                    "chat": {"id": 123456, "type": "private"},
                    "date": 1600000000,
                    "text": "hola",
                },
            }

            result = await main(args)

            assert result["success"] is True
            assert result["message"] == "message_received"
