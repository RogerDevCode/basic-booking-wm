from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from f.botilleria_chat.main import (
    BotilleriaChatInput,
    BotilleriaChatOutput,
    _main_async,
)

if TYPE_CHECKING:
    from collections.abc import Generator


class TestBotilleriaChatInput:
    def test_valid_minimal_input(self) -> None:
        data = BotilleriaChatInput(user_id="123", message="Hola")
        assert data.user_id == "123"
        assert data.message == "Hola"
        assert data.platform == "telegram"
        assert data.channel_identifier == ""
        assert data.tenant_id == ""
        assert data.session_id == ""

    def test_valid_full_input(self) -> None:
        data = BotilleriaChatInput(
            user_id="456",
            message="Quiero una cerveza",
            platform="whatsapp",
            channel_identifier="+56912345678",
            tenant_id="550e8400-e29b-41d4-a716-446655440000",
            session_id="sess-abc",
        )
        assert data.platform == "whatsapp"
        assert data.channel_identifier == "+56912345678"
        assert data.tenant_id == "550e8400-e29b-41d4-a716-446655440000"
        assert data.session_id == "sess-abc"

    def test_rejects_extra_fields(self) -> None:
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            BotilleriaChatInput(user_id="123", message="Hola", extra_field="bad")  # type: ignore[call-arg]  # pyright: ignore[reportCallIssue]

    def test_empty_message_rejected(self) -> None:
        data = BotilleriaChatInput(user_id="123", message="")
        assert data.message == ""


class TestBotilleriaChatOutput:
    def test_valid_output(self) -> None:
        out = BotilleriaChatOutput(
            response="Hola! En qué puedo ayudarte?",
            session_id="sess-123",
            user_id="456",
            tenant_slug="el_buen_trago",
            platform="telegram",
        )
        assert out.response == "Hola! En qué puedo ayudarte?"
        assert out.tenant_slug == "el_buen_trago"

    def test_output_null_tenant(self) -> None:
        out = BotilleriaChatOutput(
            response="test",
            session_id="s",
            user_id="u",
        )
        assert out.tenant_slug is None


class TestMainAsync:
    @pytest.fixture
    def mock_httpx_client(self) -> AsyncMock:
        return AsyncMock()

    @pytest.fixture
    def mock_get_variable(self) -> Generator[MagicMock]:
        with patch("f.botilleria_chat.main.get_variable", return_value=None) as m:
            yield m

    def _make_response(self, data: dict[str, Any], status: int = 200) -> MagicMock:
        resp = MagicMock()
        resp.status_code = status
        resp.json.return_value = data
        resp.text = str(data)
        resp.raise_for_status = MagicMock()
        return resp

    @pytest.mark.asyncio
    async def test_chat_success_channel_resolution(
        self,
        mock_httpx_client: AsyncMock,
        mock_get_variable: MagicMock,
    ) -> None:
        api_response = {
            "response": "Tenemos cerveza artesanal",
            "session_id": "sess-new",
            "user_id": "123",
            "tenant_slug": "el_buen_trago",
        }

        mock_resp = self._make_response(api_response)
        mock_client_instance = MagicMock()
        mock_client_instance.post = AsyncMock(return_value=mock_resp)
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client_instance):
            result = await _main_async(
                {
                    "user_id": "123",
                    "message": "Qué cervezas tienen?",
                    "platform": "telegram",
                    "channel_identifier": "bot-token-123",
                }
            )

        assert isinstance(result, BotilleriaChatOutput)
        assert result.response == "Tenemos cerveza artesanal"
        assert result.session_id == "sess-new"
        assert result.tenant_slug == "el_buen_trago"
        assert result.platform == "telegram"

        mock_client_instance.post.assert_called_once()
        call_kwargs = mock_client_instance.post.call_args[1]
        assert "X-Platform" in call_kwargs["headers"]
        assert call_kwargs["headers"]["X-Platform"] == "telegram"
        assert call_kwargs["headers"]["X-Channel-Identifier"] == "bot-token-123"
        assert "X-Tenant-ID" not in call_kwargs["headers"]

    @pytest.mark.asyncio
    async def test_chat_success_direct_tenant_id(
        self,
        mock_httpx_client: AsyncMock,
        mock_get_variable: MagicMock,
    ) -> None:
        api_response = {
            "response": "Respuesta tenant directo",
            "session_id": "sess-direct",
            "user_id": "456",
            "tenant_slug": "la_cantina",
        }

        mock_resp = self._make_response(api_response)
        mock_client_instance = MagicMock()
        mock_client_instance.post = AsyncMock(return_value=mock_resp)
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client_instance):
            result = await _main_async(
                {
                    "user_id": "456",
                    "message": "Hola",
                    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
                }
            )

        assert result.tenant_slug == "la_cantina"

        call_kwargs = mock_client_instance.post.call_args[1]
        assert call_kwargs["headers"]["X-Tenant-ID"] == "550e8400-e29b-41d4-a716-446655440000"

    @pytest.mark.asyncio
    async def test_chat_with_existing_session(
        self,
        mock_httpx_client: AsyncMock,
        mock_get_variable: MagicMock,
    ) -> None:
        api_response = {
            "response": "Continuando conversación",
            "session_id": "sess-existing",
            "user_id": "789",
        }

        mock_resp = self._make_response(api_response)
        mock_client_instance = MagicMock()
        mock_client_instance.post = AsyncMock(return_value=mock_resp)
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client_instance):
            result = await _main_async(
                {
                    "user_id": "789",
                    "message": "Siguiente pregunta",
                    "session_id": "sess-existing",
                }
            )

        assert result.session_id == "sess-existing"

        payload = mock_client_instance.post.call_args[1]["json"]
        assert payload["session_id"] == "sess-existing"

    @pytest.mark.asyncio
    async def test_chat_uses_custom_api_url(
        self,
        mock_httpx_client: AsyncMock,
        mock_get_variable: MagicMock,
    ) -> None:
        mock_get_variable.return_value = "http://custom-botilleria:9000"

        api_response = {
            "response": "test",
            "session_id": "s",
            "user_id": "u",
        }
        mock_resp = self._make_response(api_response)
        mock_client_instance = MagicMock()
        mock_client_instance.post = AsyncMock(return_value=mock_resp)
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client_instance):
            await _main_async(
                {
                    "user_id": "u",
                    "message": "test",
                }
            )

        call_args = mock_client_instance.post.call_args
        assert call_args[0][0] == "http://custom-botilleria:9000/chat"

    @pytest.mark.asyncio
    async def test_chat_http_error_raises_runtime_error(
        self,
        mock_httpx_client: AsyncMock,
        mock_get_variable: MagicMock,
    ) -> None:
        import httpx

        error_resp = MagicMock()
        error_resp.status_code = 500
        error_resp.text = "Internal Server Error"
        http_error = httpx.HTTPStatusError(
            "Server error",
            request=MagicMock(),
            response=error_resp,
        )

        mock_client_instance = MagicMock()
        mock_client_instance.post = AsyncMock(side_effect=http_error)
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client_instance):
            with pytest.raises(RuntimeError, match="Botilleria API error 500"):
                await _main_async(
                    {
                        "user_id": "123",
                        "message": "fail",
                    }
                )

    @pytest.mark.asyncio
    async def test_chat_timeout_raises_runtime_error(
        self,
        mock_httpx_client: AsyncMock,
        mock_get_variable: MagicMock,
    ) -> None:
        import httpx

        mock_client_instance = MagicMock()
        mock_client_instance.post = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client_instance):
            with pytest.raises(RuntimeError, match="Botilleria API timeout"):
                await _main_async(
                    {
                        "user_id": "123",
                        "message": "timeout",
                    }
                )

    @pytest.mark.asyncio
    async def test_chat_invalid_input_raises_runtime_error(
        self,
        mock_get_variable: MagicMock,
    ) -> None:
        with pytest.raises(RuntimeError, match="Invalid input"):
            await _main_async(
                {
                    "message": "missing user_id",
                }
            )
