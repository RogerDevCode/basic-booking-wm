from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from f.botilleria_webhook.main import (
    BotilleriaWebhookOutput,
    TelegramWebhookPayload,
    _main_async,
)


class TestTelegramWebhookPayload:
    def test_valid_minimal(self) -> None:
        data = TelegramWebhookPayload(
            update_id=1,
            message_chat_id=12345,
            message_text="Hola",
            bot_token="bot-123:ABC",
        )
        assert data.update_id == 1
        assert data.message_chat_id == 12345
        assert data.message_text == "Hola"
        assert data.bot_token == "bot-123:ABC"

    def test_valid_full(self) -> None:
        data = TelegramWebhookPayload(
            update_id=99,
            message_chat_id=67890,
            message_text="Quiero reservar",
            message_from_id=111,
            message_from_username="test_user",
            bot_token="bot-456:XYZ",
        )
        assert data.message_from_id == 111
        assert data.message_from_username == "test_user"

    def test_rejects_extra_fields(self) -> None:
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            TelegramWebhookPayload(  # type: ignore[call-arg]  # pyright: ignore[reportCallIssue]
                update_id=1,
                message_chat_id=123,
                message_text="test",
                bot_token="bot:tok",
                extra="bad",  # pyright: ignore[reportCallIssue]
            )


class TestBotilleriaWebhookOutput:
    def test_valid_output(self) -> None:
        out = BotilleriaWebhookOutput(
            response="Hola! Cómo puedo ayudarte?",
            session_id="sess-1",
            user_id="123",
            tenant_slug="el_buen_trago",
            chat_id=456,
        )
        assert out.response == "Hola! Cómo puedo ayudarte?"
        assert out.chat_id == 456


class TestWebhookMainAsync:
    def _make_response(self, data: dict[str, Any], status: int = 200) -> MagicMock:
        resp = MagicMock()
        resp.status_code = status
        resp.json.return_value = data
        resp.text = str(data)
        resp.raise_for_status = MagicMock()
        return resp

    @pytest.mark.asyncio
    async def test_webhook_success(self) -> None:
        api_response = {
            "response": "Tenemos cerveza artesanal disponible",
            "session_id": "sess-new",
            "user_id": "12345",
            "tenant_slug": "el_buen_trago",
        }

        mock_resp = self._make_response(api_response)
        mock_client = MagicMock()
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with patch("f.botilleria_webhook.main.get_variable", return_value=None):
                result = await _main_async(
                    {
                        "update_id": 1,
                        "message_chat_id": 12345,
                        "message_text": "Qué cervezas tienen?",
                        "message_from_id": 12345,
                        "bot_token": "bot-token-abc",
                    }
                )

        assert isinstance(result, BotilleriaWebhookOutput)
        assert result.response == "Tenemos cerveza artesanal disponible"
        assert result.session_id == "sess-new"
        assert result.user_id == "12345"
        assert result.tenant_slug == "el_buen_trago"
        assert result.chat_id == 12345

        mock_client.post.assert_called_once()
        call_kwargs = mock_client.post.call_args[1]
        assert call_kwargs["headers"]["X-Platform"] == "telegram"
        assert call_kwargs["headers"]["X-Channel-Identifier"] == "bot-token-abc"

    @pytest.mark.asyncio
    async def test_webhook_uses_from_id_as_user_id(self) -> None:
        api_response = {
            "response": "test",
            "session_id": "s",
            "user_id": "999",
        }

        mock_resp = self._make_response(api_response)
        mock_client = MagicMock()
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with patch("f.botilleria_webhook.main.get_variable", return_value=None):
                await _main_async(
                    {
                        "update_id": 2,
                        "message_chat_id": 111,
                        "message_text": "Hola",
                        "message_from_id": 999,
                        "bot_token": "bot-token",
                    }
                )

        payload = mock_client.post.call_args[1]["json"]
        assert payload["user_id"] == "999"

    @pytest.mark.asyncio
    async def test_webhook_falls_back_to_chat_id_when_no_from_id(self) -> None:
        api_response = {
            "response": "test",
            "session_id": "s",
            "user_id": "111",
        }

        mock_resp = self._make_response(api_response)
        mock_client = MagicMock()
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with patch("f.botilleria_webhook.main.get_variable", return_value=None):
                await _main_async(
                    {
                        "update_id": 3,
                        "message_chat_id": 111,
                        "message_text": "Hola",
                        "message_from_id": None,
                        "bot_token": "bot-token",
                    }
                )

        payload = mock_client.post.call_args[1]["json"]
        assert payload["user_id"] == "111"

    @pytest.mark.asyncio
    async def test_webhook_empty_message_raises(self) -> None:
        with pytest.raises(RuntimeError, match="EMPTY_MESSAGE"):
            await _main_async(
                {
                    "update_id": 4,
                    "message_chat_id": 222,
                    "message_text": None,
                    "bot_token": "bot-token",
                }
            )

    @pytest.mark.asyncio
    async def test_webhook_http_error_raises(self) -> None:
        import httpx

        error_resp = MagicMock()
        error_resp.status_code = 429
        error_resp.text = "Rate limited"
        http_error = httpx.HTTPStatusError(
            "Rate limited",
            request=MagicMock(),
            response=error_resp,
        )

        mock_client = MagicMock()
        mock_client.post = AsyncMock(side_effect=http_error)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with patch("f.botilleria_webhook.main.get_variable", return_value=None):
                with pytest.raises(RuntimeError, match="Botilleria API error 429"):
                    await _main_async(
                        {
                            "update_id": 5,
                            "message_chat_id": 333,
                            "message_text": "Hola",
                            "bot_token": "bot-token",
                        }
                    )

    @pytest.mark.asyncio
    async def test_webhook_custom_api_url(self) -> None:
        api_response = {
            "response": "test",
            "session_id": "s",
            "user_id": "u",
        }

        mock_resp = self._make_response(api_response)
        mock_client = MagicMock()
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with patch("f.botilleria_webhook.main.get_variable", return_value="http://custom-api:9000"):
                await _main_async(
                    {
                        "update_id": 6,
                        "message_chat_id": 444,
                        "message_text": "Hola",
                        "bot_token": "bot-token",
                    }
                )

        call_args = mock_client.post.call_args
        assert call_args[0][0] == "http://custom-api:9000/chat"
