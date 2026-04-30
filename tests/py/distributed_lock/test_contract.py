from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.distributed_lock.main import _main_async as main

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine

VALID_PROVIDER_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


@pytest.mark.asyncio
async def test_acquire_lock_success() -> None:
    mock_db = AsyncMock()
    # Mock INSERT RETURNING success
    mock_db.fetch.return_value = [
        {
            "lock_id": "l1",
            "lock_key": "k1",
            "owner_token": "o1",
            "provider_id": VALID_PROVIDER_ID,
            "start_time": "2026-05-01T10:00:00Z",
            "acquired_at": "2026-05-01T09:00:00Z",
            "expires_at": "2026-05-01T09:00:30Z",
        }
    ]

    async def mock_with_tenant(db: object, tid: str, op: Callable[[], Coroutine[Any, Any, object]]) -> object:
        return await op()

    with (
        patch("f.distributed_lock.main.create_db_client", return_value=mock_db),
        patch("f.distributed_lock.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args: dict[str, Any] = {
            "action": "acquire",
            "lock_key": "k1",
            "owner_token": "o1",
            "provider_id": VALID_PROVIDER_ID,
            "start_time": "2026-05-01T10:00:00Z",
        }

        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["acquired"] is True
        assert result["lock"]["lock_key"] == "k1"


@pytest.mark.asyncio
async def test_acquire_lock_already_held() -> None:
    mock_db = AsyncMock()
    # Mock INSERT RETURNING None (conflict) and UPDATE RETURNING None (not expired)
    mock_db.fetch.return_value = []

    async def mock_with_tenant(db: object, tid: str, op: Callable[[], Coroutine[Any, Any, object]]) -> object:
        return await op()

    with (
        patch("f.distributed_lock.main.create_db_client", return_value=mock_db),
        patch("f.distributed_lock.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args: dict[str, Any] = {
            "action": "acquire",
            "lock_key": "k1",
            "owner_token": "o1",
            "provider_id": VALID_PROVIDER_ID,
            "start_time": "2026-05-01T10:00:00Z",
        }

        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["acquired"] is False
        assert result["reason"] == "lock_already_held"
