from typing import Any
from typing import cast
from unittest.mock import AsyncMock, patch

import pytest

from f.internal._crypto import hash_password
from f.web_auth_login.main import main

VALID_EMAIL = "test@example.com"
VALID_PASSWORD = "Password123!"
STORED_HASH = hash_password(VALID_PASSWORD)


@pytest.mark.asyncio
async def test_login_success() -> None:
    mock_db = AsyncMock()
    mock_db.fetch.return_value = [
        {
            "user_id": "u1",
            "email": VALID_EMAIL,
            "full_name": "Test User",
            "role": "client",
            "password_hash": STORED_HASH,
            "is_active": True,
            "profile_complete": True,
        }
    ]

    with patch("f.web_auth_login.main.create_db_client", return_value=mock_db):
        args: dict[str, Any] = {"email": VALID_EMAIL, "password": VALID_PASSWORD}
        err, result = main(args)

        assert err is None
        assert result is not None
        assert result["user_id"] == "u1"
        assert mock_db.execute.called  # Update last_login


@pytest.mark.asyncio
async def test_login_invalid_password() -> None:
    mock_db = AsyncMock()
    mock_db.fetch.return_value = [
        {
            "user_id": "u1",
            "email": VALID_EMAIL,
            "full_name": "Test User",
            "role": "client",
            "password_hash": STORED_HASH,
            "is_active": True,
            "profile_complete": True,
        }
    ]

    with patch("f.web_auth_login.main.create_db_client", return_value=mock_db):
        args: dict[str, Any] = {"email": VALID_EMAIL, "password": "WrongPassword"}
        err, _result = main(args)

        assert err is not None
        assert "Invalid email or password" in str(err)
