from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.web_admin_users.main import _main_async as main

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine


@pytest.mark.asyncio
async def test_admin_users_list_success() -> None:
    mock_db = AsyncMock()
    # 1. verify requesting admin
    # 2. list users fetch
    # 3. count users fetch
    mock_db.fetch.side_effect = [
        [{"role": "admin"}],  # admin check
        [
            {
                "user_id": "u1",
                "full_name": "Test User",
                "email": "t@t.com",
                "rut": "1-9",
                "phone": "123",
                "role": "client",
                "is_active": True,
                "telegram_chat_id": None,
                "last_login": None,
                "created_at": "2026-05-01T10:00:00Z",
            }
        ],
        [{"total": 1}],
    ]

    async def mock_with_tenant(db: object, tid: str, op: Callable[[], Coroutine[Any, Any, object]]) -> object:
        return await op()

    with (
        patch("f.web_admin_users.main.create_db_client", return_value=mock_db),
        patch("f.web_admin_users.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args: dict[str, Any] = {"action": "list", "admin_user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"}
        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["total"] == 1
        assert result["users"][0]["full_name"] == "Test User"
