import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from f.telegram_send.main import main

@pytest.mark.asyncio
async def test_telegram_send_success() -> None:
    # Mock bot token
    with patch("f.internal._wmill_adapter.get_variable", return_value="fake-token"):
        # Mock API call
        with patch("f.telegram_send._telegram_logic.httpx.AsyncClient") as mock_client_class:
            mock_client = mock_client_class.return_value.__aenter__.return_value
            mock_res = MagicMock()
            mock_res.json.return_value = {"ok": True, "result": {"message_id": 12345}}
            mock_res.status_code = 200
            mock_client.post.return_value = mock_res
            
            args = {
                "chat_id": "123456",
                "text": "Hello world",
                "mode": "send_message"
            }
            
            err, result = await main(args['mode'], args['chat_id'], args['text'])
            
            assert err is None
            assert result is not None
            assert result.sent is True
            assert result.message_id == 12345

@pytest.mark.asyncio
async def test_telegram_send_invalid_input() -> None:
    err, result = await main("send_message", None, None)
    assert err is not None
    assert result is None

