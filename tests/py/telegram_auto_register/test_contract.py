from typing import Any
from typing import cast, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.telegram_auto_register.main import main


@pytest.mark.asyncio
async def test_telegram_auto_register_success() -> None:
    mock_db = AsyncMock()
    # 1. SELECT user by chat_id -> []
    # 2. INSERT user -> returning row
    mock_db.fetch.side_effect = [
        [],  # no existing user
        [{"user_id": "u123"}],  # insert result
    ]

    async def mock_with_admin(db: object, op: Any) -> object:
        return await op()

    with (
        patch("f.telegram_auto_register.main.create_db_client", return_value=mock_db),
        patch("f.telegram_auto_register.main.with_admin_context", side_effect=mock_with_admin),
    ):
        args: dict[str, Any] = {"chat_id": "123456", "first_name": "Test", "last_name": "User"}

        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["user_id"] == "u123"
        assert result["is_new"] is True
        # Verify fetch was called twice (lookup + insert)
        assert mock_db.fetch.call_count == 2
