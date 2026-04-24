import pytest
from unittest.mock import AsyncMock, patch
from f.conversation_logger.main import main

VALID_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

@pytest.mark.asyncio
async def test_conversation_logger_success() -> None:
    mock_db = AsyncMock()
    # 1. persist_log insert returning
    mock_db.fetch.return_value = [{"message_id": "m1"}]
    
    async def mock_with_tenant(db, tid, op):
        return await op()

    with patch("f.conversation_logger.main.create_db_client", return_value=mock_db), \
         patch("f.conversation_logger.main.with_tenant_context", side_effect=mock_with_tenant):
        
        args = {
            "provider_id": VALID_ID,
            "channel": "telegram",
            "direction": "incoming",
            "content": "Hello bot"
        }
        
        err, result = await main(args)
        
        assert err is None
        assert result["message_id"] == "m1"
        assert mock_db.fetch.called
