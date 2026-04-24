import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from f.booking_orchestrator.main import main
from f.booking_orchestrator._orchestrator_models import OrchestratorInput, OrchestratorResult

@pytest.mark.asyncio
async def test_orchestrator_create_booking_wizard_handoff() -> None:
    # Mock DB Client
    mock_db = AsyncMock()
    # 1. tenant fallback -> [{"provider_id": "..."}]
    # 2. client by telegram -> []
    # 3. client insert -> [{"client_id": "c123"}]
    # 4. service fallback -> []
    mock_db.fetch.side_effect = [
        [{"provider_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"}], 
        [], 
        [{"client_id": "c2c3d4e5-f6a7-8901-bcde-f12345678901"}],
        []
    ]
    
    with patch("f.booking_orchestrator.main.create_db_client", return_value=mock_db):
        args = {
            "intent": "crear_cita",
            "entities": {
                "date": "2026-05-01",
                "time": "10:00"
            },
            "channel": "telegram",
            "telegram_chat_id": "123456"
        }
        
        err, result = await main(args)
        
        assert err is None
        assert result is not None
        assert result["action"] == "crear_cita"
        # success=False means it went to wizard
        assert result["success"] is False
        assert result["nextState"]["name"] == "selecting_specialty"

@pytest.mark.asyncio
async def test_orchestrator_cancel_booking_no_id_routes_to_list() -> None:
    mock_db = AsyncMock()
    mock_db.fetch.return_value = [] # No bookings found
    
    # Mock for with_tenant_context to just call the operation
    async def mock_with_tenant(conn, tenant_id, op):
        return await op()

    with patch("f.booking_orchestrator.main.create_db_client", return_value=mock_db), \
         patch("f.booking_orchestrator.handlers._cancel.cancel_booking", AsyncMock(return_value=(None, {}))), \
         patch("f.booking_orchestrator.handlers._get_my_bookings.with_tenant_context", side_effect=mock_with_tenant):
        
        args = {
            "intent": "cancelar_cita",
            "entities": {},
            "client_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
            "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        }
        
        err, result = await main(args)
        
        assert err is None
        assert result is not None
        assert result["action"] == "mis_citas"
        assert "No tienes próximas citas" in result["message"]
