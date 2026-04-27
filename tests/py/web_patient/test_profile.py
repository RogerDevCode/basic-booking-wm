from unittest.mock import AsyncMock, patch

import pytest

from f.web_patient_profile.main import main

VALID_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


@pytest.mark.asyncio
async def test_patient_profile_get_success() -> None:
    mock_db = AsyncMock()
    # 1. find_user
    # 2. find_or_create_client
    mock_db.fetch.side_effect = [
        [{"user_id": VALID_ID, "full_name": "Test User", "email": "t@t.com"}],  # find_user
        [
            {
                "client_id": "c1",
                "name": "Test User",
                "email": "t@t.com",
                "phone": "123",
                "telegram_chat_id": None,
                "timezone": "UTC",
                "gcal_calendar_id": None,
            }
        ],  # find_or_create_client
    ]

    async def mock_with_tenant(db: object, tid: str, op: object) -> object:
        return await op()

    with (
        patch("f.web_patient_profile.main.create_db_client", return_value=mock_db),
        patch("f.web_patient_profile.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args = {"user_id": VALID_ID, "action": "get"}
        err, result = await main(args)

        assert err is None
        assert result["client_id"] == "c1"
        assert result["name"] == "Test User"
