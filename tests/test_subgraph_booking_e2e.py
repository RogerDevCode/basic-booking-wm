from __future__ import annotations

import sys
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Mock wmill
sys.modules["wmill"] = MagicMock()

from f.booking_orchestrator.main import _main_async  # noqa: E402


@pytest.fixture
def mock_context() -> tuple[None, dict[str, Any]]:
    return (
        None,
        {
            "tenantId": "550e8400-e29b-41d4-a716-446655440000",
            "clientId": "550e8400-e29b-41d4-a716-446655440000",
            "providerId": "550e8400-e29b-41d4-a716-446655440000",
            "serviceId": "550e8400-e29b-41d4-a716-446655440000",
            "date": "2026-05-10",
            "time": "10:00",
        },
    )


@pytest.mark.asyncio
async def test_booking_cycle_create(mock_context: tuple[None, dict[str, Any]]) -> None:
    mock_db = AsyncMock()
    mock_db.execute.return_value = "OK"
    mock_db.fetch.side_effect = [
        [{"client_id": "550e8400-e29b-41d4-a716-446655440000"}],
        [
            {
                "booking_id": "b1",
                "status": "confirmed",
                "start_time": "2026-05-10T10:00:00",
                "provider_name": "Dr. Smith",
                "specialty": "Dentista",
                "service_name": "Consulta",
            }
        ],
    ]
    mock_result = {"action": "crear_cita", "success": True}
    with (
        patch("f.booking_orchestrator.main.create_db_client", return_value=mock_db),
        patch("f.booking_orchestrator.main.resolve_context", return_value=mock_context),
        patch("f.booking_orchestrator.handlers._create.handle_create_booking", return_value=(None, mock_result)),
    ):
        args: dict[str, object] = {"telegram_chat_id": "123", "intent": "crear_cita", "entities": {}}
        err, result = await _main_async(args)
        assert err is None
        assert result is not None
        assert result["action"] == "crear_cita"
        assert result["success"] is True


@pytest.mark.asyncio
async def test_booking_cycle_cancel(mock_context: tuple[None, dict[str, Any]]) -> None:
    mock_db = AsyncMock()
    mock_db.execute.return_value = "OK"
    mock_db.fetch.side_effect = [
        [{"client_id": "550e8400-e29b-41d4-a716-446655440000"}],
        [
            {
                "booking_id": "b1",
                "status": "confirmed",
                "start_time": "2026-05-10T10:00:00",
                "provider_name": "Dr. Smith",
                "specialty": "Dentista",
                "service_name": "Consulta",
            }
        ],
    ]
    mock_result = {"action": "cancelar_cita", "success": True}
    with (
        patch("f.booking_orchestrator.main.create_db_client", return_value=mock_db),
        patch("f.booking_orchestrator.main.resolve_context", return_value=mock_context),
        patch("f.booking_orchestrator.handlers._cancel.handle_cancel_booking", return_value=(None, mock_result)),
    ):
        args: dict[str, object] = {"telegram_chat_id": "123", "intent": "cancelar_cita", "entities": {}}
        err, result = await _main_async(args)
        assert err is None
        assert result is not None
        assert result["action"] == "cancelar_cita"
        assert result["success"] is True


@pytest.mark.asyncio
async def test_booking_cycle_reschedule(mock_context: tuple[None, dict[str, Any]]) -> None:
    mock_db = AsyncMock()
    mock_db.execute.return_value = "OK"
    mock_db.fetch.side_effect = [
        [{"client_id": "550e8400-e29b-41d4-a716-446655440000"}],
        [
            {
                "booking_id": "b1",
                "status": "confirmed",
                "start_time": "2026-05-10T10:00:00",
                "provider_name": "Dr. Smith",
                "specialty": "Dentista",
                "service_name": "Consulta",
            }
        ],
    ]
    mock_result = {"action": "reagendar_cita", "success": True}
    with (
        patch("f.booking_orchestrator.main.create_db_client", return_value=mock_db),
        patch("f.booking_orchestrator.main.resolve_context", return_value=mock_context),
        patch("f.booking_orchestrator.handlers._reschedule.handle_reschedule", return_value=(None, mock_result)),
    ):
        args: dict[str, object] = {"telegram_chat_id": "123", "intent": "reagendar_cita", "entities": {}}
        err, result = await _main_async(args)
        assert err is None
        assert result is not None
        assert result["action"] == "reagendar_cita"
        assert result["success"] is True