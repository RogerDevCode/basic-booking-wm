from unittest.mock import AsyncMock, patch

import pytest

from f.booking_orchestrator.main import HANDLER_MAP
from f.booking_orchestrator.main import _main_async as main


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

    # Create a mock handler and temporarily replace it in HANDLER_MAP
    mock_handler = AsyncMock(
        return_value=(None, {"action": "crear_cita", "success": False, "nextState": {"name": "selecting_specialty"}})
    )
    original_handler = HANDLER_MAP["crear_cita"]
    HANDLER_MAP["crear_cita"] = mock_handler

    try:
        with (
            patch("f.booking_orchestrator.main.create_db_client", return_value=mock_db),
            patch("f.booking_orchestrator.main.resolve_context", AsyncMock(return_value=(None, ctx))),
        ):
            err, result = await main(
                {
                    "telegram_chat_id": "123456",
                    "intent": "crear_cita",
                    "entities": {"date": "2026-05-01", "time": "10:00"},
                }
            )
            assert err is None
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
    with (
        patch("f.booking_orchestrator.main.create_db_client", return_value=mock_db),
        patch("f.booking_orchestrator.main.resolve_context", AsyncMock(return_value=(None, ctx))),
    ):
        # main raises RuntimeError on error now
        # But _main_async returns (err, None)
        err, _result = await main({"telegram_chat_id": "123456", "intent": "cancelar_cita", "entities": {}})
        assert err is not None
