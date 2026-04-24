import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from f.telegram_callback.main import main

VALID_TENANT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
VALID_BOOKING_ID = "b2c3d4e5-f6a7-8901-bcde-f12345678901"

@pytest.mark.asyncio
async def test_telegram_callback_confirm_success() -> None:
    mock_db = AsyncMock()
    # 1. SELECT in confirm_booking
    mock_db.fetch.return_value = [{"booking_id": VALID_BOOKING_ID, "status": "pending", "client_id": VALID_TENANT_ID}]
    
    # Mock with_tenant_context
    async def mock_with_tenant(db, tid, op):
        return await op()

    with patch("f.telegram_callback.main.get_variable", return_value="fake-token"), \
         patch("f.telegram_callback._callback_router.create_db_client", return_value=mock_db), \
         patch("f.telegram_callback._callback_router.with_tenant_context", side_effect=mock_with_tenant), \
         patch("f.telegram_callback._callback_logic.answer_callback_query", AsyncMock(return_value=True)), \
         patch("f.telegram_callback._callback_logic.send_followup_message", AsyncMock(return_value=True)):
        
        args = {
            "callback_query_id": "q123",
            "callback_data": f"cnf:{VALID_BOOKING_ID}",
            "chat_id": "123456",
            "client_id": VALID_TENANT_ID
        }
        
        err, result = await main(args)
        
        assert err is None
        assert result is not None
        assert result["action"] == "confirm"
        assert "Cita confirmada" in result["response_text"]
        assert mock_db.execute.called # Update + Audit

@pytest.mark.asyncio
async def test_telegram_callback_invalid_data() -> None:
    with patch("f.telegram_callback.main.get_variable", return_value="fake-token"), \
         patch("f.telegram_callback._callback_logic.answer_callback_query", AsyncMock(return_value=True)):
        
        args = {
            "callback_query_id": "q123",
            "callback_data": "invalid_format",
            "chat_id": "123456",
            "client_id": VALID_TENANT_ID
        }
        
        err, result = await main(args)
        assert err is not None
        assert "Invalid callback data" in str(err)
