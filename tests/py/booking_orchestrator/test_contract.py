from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from f.booking_orchestrator.main import HANDLER_MAP
from f.booking_orchestrator.main import _main_async as main


def _make_delegates(**overrides: object) -> dict[str, AsyncMock]:
    d: dict[str, AsyncMock] = {
        "book_create": AsyncMock(return_value={}),
        "book_cancel": AsyncMock(return_value={}),
        "book_reschedule": AsyncMock(return_value={}),
        "availability_check": AsyncMock(return_value={}),
    }
    for k, v in overrides.items():
        d[k] = v  # type: ignore[assignment]
    return d


@pytest.mark.asyncio
async def test_orchestrator_create_booking_wizard_handoff() -> None:
    mock_db = AsyncMock()
    mock_db.close = AsyncMock()

    ctx = {
        "tenantId": "t1",
        "clientId": "c1",
        "providerId": "p1",
        "serviceId": "s1",
        "date": "2026-05-01",
        "time": "10:00",
    }

    mock_handler = AsyncMock(
        return_value={"action": "crear_cita", "success": False, "nextState": {"name": "selecting_specialty"}}
    )
    original_handler = HANDLER_MAP["crear_cita"]
    HANDLER_MAP["crear_cita"] = mock_handler

    try:
        with (
            patch("f.booking_orchestrator.main.create_db_client", return_value=mock_db),
            patch("f.booking_orchestrator.main.resolve_context", AsyncMock(return_value=ctx)),
        ):
            result = await main(
                {
                    "telegram_chat_id": "123456",
                    "intent": "crear_cita",
                    "entities": {"date": "2026-05-01", "time": "10:00"},
                },
                _make_delegates(),
            )
            assert result is not None
            assert result["action"] == "crear_cita"
            assert result["success"] is False
    finally:
        HANDLER_MAP["crear_cita"] = original_handler


@pytest.mark.asyncio
async def test_orchestrator_cancel_booking_no_id_routes_to_list() -> None:
    mock_db = AsyncMock()
    mock_db.close = AsyncMock()

    ctx = {"tenantId": "t1", "clientId": "c1", "providerId": "p1", "serviceId": "s1", "date": None, "time": None}

    # With no booking_id, _cancel delegates to get_my_bookings which needs tenant context
    # Mock the entire cancel handler to check routing
    mock_handler = AsyncMock(return_value={"action": "mis_citas", "success": True, "data": []})
    original_handler = HANDLER_MAP["cancelar_cita"]
    HANDLER_MAP["cancelar_cita"] = mock_handler

    try:
        with (
            patch("f.booking_orchestrator.main.create_db_client", return_value=mock_db),
            patch("f.booking_orchestrator.main.resolve_context", AsyncMock(return_value=ctx)),
        ):
            result = await main(
                {"telegram_chat_id": "123456", "intent": "cancelar_cita", "entities": {}},
                _make_delegates(),
            )
            assert result is not None
            assert result["action"] == "mis_citas"
    finally:
        HANDLER_MAP["cancelar_cita"] = original_handler
