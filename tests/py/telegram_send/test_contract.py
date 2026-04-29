from typing import Any
from unittest.mock import MagicMock, patch

import pytest

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

            args: dict[str, Any] = {"chat_id": "123456", "text": "Hello world", "mode": "send_message"}

            # main returns result or raises
            result = await main(args["mode"], args["chat_id"], args["text"])
            assert result is not None
            assert result is not None
            assert result.sent is True
            assert result.message_id == 12345


@pytest.mark.asyncio
async def test_telegram_send_invalid_input() -> None:
    # main raises RuntimeError (wrapping Pydantic ValidationError)
    with pytest.raises(RuntimeError):
        from typing import cast
        await main("send_message", cast(Any, None), cast(Any, None))
