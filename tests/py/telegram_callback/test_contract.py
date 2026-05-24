from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.telegram_callback.main import _main_async as main

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine

VALID_TENANT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
VALID_BOOKING_ID = "b2c3d4e5-f6a7-8901-bcde-f12345678901"


@pytest.mark.asyncio
async def test_telegram_callback_confirm_success() -> None:
    mock_db = AsyncMock()
    # 1. UPDATE ... RETURNING in confirm_booking (now uses fetchrow)
    mock_db.fetchrow.return_value = {"booking_id": VALID_BOOKING_ID, "status": "pending", "client_id": VALID_TENANT_ID}

    # Mock with_tenant_context
    async def mock_with_tenant(db: object, tid: str, op: Callable[[], Coroutine[Any, Any, object]]) -> object:
        return await op()

    with (
        patch("f.telegram_callback.main.get_variable", return_value="fake-token"),
        patch("f.telegram_callback._callback_router.create_db_client", return_value=mock_db),
        patch("f.telegram_callback._callback_router.with_tenant_context", side_effect=mock_with_tenant),
        patch("f.telegram_callback._callback_logic.answer_callback_query", AsyncMock(return_value=True)),
        patch("f.telegram_callback._callback_logic.send_followup_message", AsyncMock(return_value=True)),
    ):
        args: dict[str, Any] = {
            "callback_query_id": "q123",
            "callback_data": f"cnf:{VALID_BOOKING_ID}",
            "chat_id": "123456",
            "client_id": VALID_TENANT_ID,
        }

        result = await main(args)

        assert isinstance(result, dict)
        assert result["action"] == "confirm"
        assert "Cita confirmada" in str(result["response_text"])
        assert mock_db.execute.called  # Update + Audit


@pytest.mark.asyncio
async def test_telegram_callback_invalid_data() -> None:
    with (
        patch("f.telegram_callback.main.get_variable", return_value="fake-token"),
        patch("f.telegram_callback._callback_logic.answer_callback_query", AsyncMock(return_value=True)),
    ):
        args: dict[str, Any] = {
            "callback_query_id": "q123",
            "callback_data": "invalid_format",
            "chat_id": "123456",
            "client_id": VALID_TENANT_ID,
        }

        with pytest.raises(RuntimeError, match="Invalid callback data"):
            await main(args)


@pytest.mark.asyncio
async def test_telegram_callback_cancel_reason_proactive_support() -> None:
    mock_db = AsyncMock()
    mock_db.fetchval.return_value = 2

    async def mock_with_tenant(db: object, tid: str, op: Callable[[], Coroutine[Any, Any, object]]) -> object:
        from f.services.booking._booking_models import BookingResult

        return BookingResult(booking_id=VALID_BOOKING_ID, status="cancelled")

    with (
        patch("f.telegram_callback.main.get_variable", return_value="fake-token"),
        patch("f.telegram_callback._callback_router.create_db_client", return_value=mock_db),
        patch("f.telegram_callback._callback_router.with_tenant_context", side_effect=mock_with_tenant),
        patch("f.telegram_callback._callback_logic.answer_callback_query", AsyncMock(return_value=True)),
        patch("f.telegram_callback._callback_logic.send_followup_message", AsyncMock(return_value=True)),
    ):
        args: dict[str, Any] = {
            "callback_query_id": "q123",
            "callback_data": f"cxr:{VALID_BOOKING_ID}:CH",
            "chat_id": "123456",
            "client_id": VALID_TENANT_ID,
        }

        result = await main(args)

        assert isinstance(result, dict)
        assert result["action"] == "cancel_reason"
        assert "Cita cancelada" in str(result["response_text"])
        follow_up = str(result["follow_up_text"])
        assert "soporte@ejemplo.com" in follow_up
        assert "¿Te gustaría agendar una nueva hora" in follow_up

        from typing import cast

        buttons = cast("list[list[dict[str, str]]]", result["inline_buttons"])
        assert buttons is not None
        assert buttons[0][0]["text"] == "📅 Agendar nueva hora"
        assert buttons[0][0]["callback_data"] == "cmd:agendar"
