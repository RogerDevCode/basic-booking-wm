import pytest
from unittest.mock import AsyncMock, patch
from f.provider_agenda.main import main

VALID_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

@pytest.mark.asyncio
async def test_provider_agenda_success() -> None:
    mock_db = AsyncMock()
    # 1. SELECT provider
    # 2. SELECT override
    # 3. SELECT schedule
    # 4. SELECT bookings
    mock_db.fetch.side_effect = [
        [{"provider_id": VALID_ID, "name": "Dr. Test"}], # provider
        [], # override for 2026-05-01
        [{"start_time": "09:00", "end_time": "17:00"}], # schedule for Fri (2026-05-01 is Fri)
        [{"booking_id": "b1", "start_time": "2026-05-01T10:00:00Z", "end_time": "2026-05-01T10:30:00Z", "status": "confirmed", "service_name": "Consult"}] # bookings
    ]
    
    async def mock_with_tenant(db, tid, op):
        return await op()

    with patch("f.provider_agenda.main.create_db_client", return_value=mock_db), \
         patch("f.provider_agenda.main.with_tenant_context", side_effect=mock_with_tenant):
        
        args = {
            "provider_id": VALID_ID,
            "date_from": "2026-05-01",
            "date_to": "2026-05-01"
        }
        
        err, result = await main(args)
        
        assert err is None
        assert result["provider_id"] == VALID_ID
        assert len(result["days"]) == 1
        assert len(result["days"][0]["bookings"]) == 1
        assert result["days"][0]["bookings"][0]["booking_id"] == "b1"
