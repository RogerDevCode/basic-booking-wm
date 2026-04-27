from unittest.mock import AsyncMock, patch

import pytest

from f.web_auth_register.main import main


@pytest.mark.asyncio
async def test_register_success() -> None:
    mock_db = AsyncMock()
    mock_db.fetch.side_effect = [
        [],  # No existing user
        [{"user_id": "u1", "email": "new@example.com", "full_name": "New User", "role": "client"}],  # Insert result
    ]

    with patch("f.web_auth_register.main.create_db_client", return_value=mock_db):
        args = {
            "full_name": "New User",
            "rut": "12345678-5",
            "email": "new@example.com",
            "address": "Street 123",
            "phone": "+56912345678",
            "password": "Password123!",
            "password_confirm": "Password123!",
        }

        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["user_id"] == "u1"


@pytest.mark.asyncio
async def test_register_invalid_rut() -> None:
    args = {
        "full_name": "New User",
        "rut": "12345678-0",  # Invalid DV
        "email": "new@example.com",
        "address": "Street 123",
        "phone": "+56912345678",
        "password": "Password123!",
        "password_confirm": "Password123!",
    }
    err, _result = await main(args)
    assert err is not None
    assert "Invalid Chilean RUT" in str(err)
