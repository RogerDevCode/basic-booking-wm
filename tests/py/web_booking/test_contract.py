import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from f.web_booking_api.main import main

VALID_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

@pytest.mark.asyncio
async def test_web_booking_crear_success() -> None:
    mock_db = AsyncMock()
    # 1. resolve_client_id -> direct lookup
    # 2. lock_provider
    # 3. get_service_duration
    # 4. check_overlap
    # 5. insert_booking
    mock_db.fetch.side_effect = [
        [{"client_id": "c1"}], # resolve_client_id
        [{"provider_id": "p1"}], # lock_provider
        [{"duration_minutes": 30}], # get_service_duration
        [], # check_overlap (no rows = no overlap)
        [{"booking_id": "b1", "status": "pending"}] # insert result
    ]
    
    async def mock_with_tenant(db, tid, op):
        return await op()

    with patch("f.web_booking_api.main.create_db_client", return_value=mock_db), \
         patch("f.web_booking_api.main.with_tenant_context", side_effect=mock_with_tenant):
        
        args = {
            "action": "crear",
            "user_id": VALID_ID,
            "provider_id": VALID_ID,
            "service_id": VALID_ID,
            "start_time": "2026-05-01T10:00:00Z"
        }
        
        err, result = await main(args)
        
        assert err is None
        assert result["booking_id"] == "b1"
        assert result["status"] == "pending"
