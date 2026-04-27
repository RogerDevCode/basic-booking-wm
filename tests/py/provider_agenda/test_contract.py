import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch, MagicMock
from f.provider_agenda.main import main

VALID_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

@pytest.mark.asyncio
async def test_provider_agenda_success() -> None:
    mock_db = AsyncMock()
    # Logic expects datetime objects from database
    st = datetime(2026, 5, 1, 10, 0, tzinfo=timezone.utc)
    et = datetime(2026, 5, 1, 10, 30, tzinfo=timezone.utc)
    
    # get_provider_agenda solo hace UNA llamada a fetch para traer las reservas.
    # El resto de validaciones (provider, etc) parecen no estar en la lógica actual de f/provider_agenda/_agenda_logic.py
    booking_row = {
        "booking_id": "b1", 
        "start_time": st, 
        "end_time": et, 
        "status": "confirmed", 
        "service_name": "Consult", 
        "client_name": "Alice", 
        "client_phone": "123"
    }
    
    mock_db.fetch.return_value = [booking_row]

    async def mock_with_tenant(db, tid, op):
        return await op()

    with patch("f.provider_agenda.main.create_db_client", return_value=mock_db), \
         patch("f.provider_agenda.main.with_tenant_context", side_effect=mock_with_tenant):

        args = {
            "provider_id": VALID_ID,
            "date_from": "2026-05-01",
            "date_to": "2026-05-01"
        }

        # main returns result or raises
        result = await main(args)
        assert result is not None
        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["booking_id"] == "b1"
