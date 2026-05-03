from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.telegram_auto_register.main import _main_async as main

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine


@pytest.mark.asyncio
async def test_telegram_auto_register_success() -> None:
    mock_db = AsyncMock()
    # 1. SELECT users → []      (no existing user)
    # 2. INSERT users → row      (new user created)
    # 3. SELECT clients → []     (no existing client)
    # 4. INSERT clients → row    (new client created)
    mock_db.fetch.side_effect = [
        [],
        [{"user_id": "u123"}],
        [],
        [{"client_id": "c456"}],
    ]

    async def mock_with_admin(db: object, op: Callable[[], Coroutine[Any, Any, object]]) -> object:
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
        assert result["client_id"] == "c456"
        assert result["is_new"] is True
        # 4 calls: SELECT users, INSERT users, SELECT clients, INSERT clients
        assert mock_db.fetch.call_count == 4
