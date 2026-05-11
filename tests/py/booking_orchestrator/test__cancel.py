from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from f.booking_orchestrator._orchestrator_models import OrchestratorInput
from f.booking_orchestrator.handlers._cancel import handle_cancel_booking


def _make_input(**kwargs: object) -> OrchestratorInput:
    base: dict[str, object] = {
        "intent": "cancelar_cita",
        "tenant_id": "11111111-1111-1111-1111-111111111111",
        "client_id": "22222222-2222-2222-2222-222222222222",
        "telegram_chat_id": "12345",
    }
    base.update(kwargs)
    return OrchestratorInput.model_validate(base)


def _make_delegates(**overrides: object) -> dict[str, AsyncMock]:
    d: dict[str, AsyncMock] = {
        "availability_check": AsyncMock(return_value={}),
    }
    for k, v in overrides.items():
        d[k] = v  # type: ignore[assignment]
    return d


@pytest.mark.asyncio
async def test_handle_cancel_booking_no_id_delegates_to_get_my_bookings() -> None:
    conn = AsyncMock()
    mock_result = {
        "action": "mis_citas",
        "success": True,
        "data": [],
        "message": "📋 No tienes próximas citas.",
    }

    with patch(
        "f.booking_orchestrator.handlers._cancel.handle_get_my_bookings",
        AsyncMock(return_value=mock_result),
    ) as mock_list:
        input_data = _make_input()
        result = await handle_cancel_booking(conn, input_data, _make_delegates())

        assert result is not None
        assert result["action"] == "mis_citas"
        mock_list.assert_called_once()
        called_input: OrchestratorInput = mock_list.call_args[0][1]
        assert called_input.notes is not None and "ID" in called_input.notes


@pytest.mark.asyncio
async def test_handle_cancel_booking_with_id_calls_cancel_module_successfully() -> None:
    conn = AsyncMock()
    input_data = _make_input(booking_id="booking-abc-123")

    with patch(
        "f.booking_cancel.main.run_cancel_booking",
        AsyncMock(return_value={"booking_id": "booking-abc-123", "status": "cancelled"}),
    ) as mock_run:
        result = await handle_cancel_booking(conn, input_data, _make_delegates())

    assert result is not None
    assert result["action"] == "cancelar_cita"
    assert result["success"] is True
    assert "✅" in result["message"]
    mock_run.assert_awaited_once()


@pytest.mark.asyncio
async def test_handle_cancel_booking_cancel_failure_sets_success_false() -> None:
    conn = AsyncMock()
    input_data = _make_input(booking_id="booking-xyz")

    with patch(
        "f.booking_cancel.main.run_cancel_booking",
        AsyncMock(side_effect=Exception("Booking not found")),
    ):
        result = await handle_cancel_booking(conn, input_data, _make_delegates())

    assert result is not None
    assert result["success"] is False
    assert "❌" in result["message"]
