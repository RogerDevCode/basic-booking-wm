from unittest.mock import AsyncMock, patch

import pytest

from f.web_provider_profile.main import main

VALID_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


@pytest.mark.asyncio
async def test_provider_profile_get_success() -> None:
    mock_db = AsyncMock()
    # 1. find_by_id fetch
    mock_db.fetch.return_value = [
        {
            "id": VALID_ID,
            "name": "Dr. Smith",
            "email": "s@s.com",
            "honorific_label": "Dr.",
            "specialty_name": "Cardio",
            "timezone_name": "Mexico",
            "phone_app": "123",
            "phone_contact": "456",
            "telegram_chat_id": "tg1",
            "gcal_calendar_id": "cal1",
            "address_street": "Main",
            "address_number": "100",
            "address_complement": None,
            "address_sector": None,
            "region_name": "RM",
            "commune_name": "Santiago",
            "is_active": True,
            "password_hash": "hash",
            "last_password_change": None,
            "created_at": "2026-05-01T10:00:00Z",
            "updated_at": "2026-05-01T10:00:00Z",
        }
    ]

    async def mock_with_tenant(db: object, tid: str, op: object) -> object:
        return await op()

    with (
        patch("f.web_provider_profile.main.create_db_client", return_value=mock_db),
        patch("f.web_provider_profile.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args = {"action": "get_profile", "provider_id": VALID_ID}
        err, result = await main(args)

        assert err is None
        assert result["id"] == VALID_ID
        assert result["name"] == "Dr. Smith"
        assert result["has_password"] is True
