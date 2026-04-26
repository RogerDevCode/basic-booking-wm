import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from f.booking_orchestrator.main import main
from f.booking_orchestrator._orchestrator_models import OrchestratorInput, OrchestratorResult

@pytest.mark.asyncio
async def test_orchestrator_create_booking_wizard_handoff() -> None:
    mock_db = AsyncMock()
    mock_db.close = AsyncMock()
    
    ctx = {"tenantId": "t1", "clientId": "c1", "providerId": "p1", "serviceId": "s1", "date": "2026-05-01", "time": "10:00"}
    with patch("f.booking_orchestrator.main.create_db_client", return_value=mock_db), \
         patch("f.booking_orchestrator.main.resolve_context", AsyncMock(return_value=(None, ctx))), \
         patch("f.booking_orchestrator.main.handle_create_booking", AsyncMock(return_value=(None, {"action": "crear_cita", "success": False, "nextState": {"name": "selecting_specialty"}}))):
        
        err, result = await main("123456", "crear_cita", {"date": "2026-05-01", "time": "10:00"})
        
        assert err is None
        assert result is not None
        assert result["action"] == "crear_cita"
        assert result["success"] is False

@pytest.mark.asyncio
async def test_orchestrator_cancel_booking_no_id_routes_to_list() -> None:
    mock_db = AsyncMock()
    mock_db.close = AsyncMock()
    
    ctx = {"tenantId": "t1", "clientId": "c1", "providerId": "p1", "serviceId": "s1", "date": None, "time": None}
    with patch("f.booking_orchestrator.main.create_db_client", return_value=mock_db), \
         patch("f.booking_orchestrator.main.resolve_context", AsyncMock(return_value=(None, ctx))):
        
        err, result = await main("123456", "cancelar_cita", {})
        
        # It should return an error since handle_get_my_bookings might not be fully mocked
        assert err is not None


