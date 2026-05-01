from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from f.booking_orchestrator.main import _main_async as main


@pytest.mark.asyncio
async def test_main_async_non_string_intent_returns_error() -> None:
    err, result = await main({"intent": 42, "telegram_chat_id": "123"})

    assert err is not None
    assert result is None


@pytest.mark.asyncio
async def test_main_async_unknown_intent_returns_none_gracefully() -> None:
    err, result = await main({"intent": "duda_general", "telegram_chat_id": "123"})

    assert err is None
    assert result is None


@pytest.mark.asyncio
async def test_main_async_valid_intent_routes_to_handler() -> None:
    mock_db = AsyncMock()
    mock_ctx = {
        "tenantId": "11111111-1111-1111-1111-111111111111",
        "clientId": "22222222-2222-2222-2222-222222222222",
        "providerId": None,
        "serviceId": None,
        "date": None,
        "time": None,
    }
    mock_result = {"action": "mis_citas", "success": True, "data": [], "message": "📋 No tienes próximas citas."}

    with (
        patch("f.booking_orchestrator.main.create_db_client", return_value=mock_db),
        patch("f.booking_orchestrator.main.resolve_context", AsyncMock(return_value=(None, mock_ctx))),
        patch(
            "f.booking_orchestrator.main.HANDLER_MAP",
            {"mis_citas": AsyncMock(return_value=(None, mock_result))},
        ),
    ):
        err, result = await main({"intent": "mis_citas", "telegram_chat_id": "123", "entities": {}})

        assert err is None
        assert result is not None
        assert result["action"] == "mis_citas"


@pytest.mark.asyncio
async def test_main_async_context_resolution_failure_returns_error() -> None:
    mock_db = AsyncMock()

    with (
        patch("f.booking_orchestrator.main.create_db_client", return_value=mock_db),
        patch(
            "f.booking_orchestrator.main.resolve_context",
            AsyncMock(return_value=(Exception("no tenant"), None)),
        ),
    ):
        err, result = await main({"intent": "mis_citas", "telegram_chat_id": "123", "entities": {}})

        assert err is not None
        assert result is None
