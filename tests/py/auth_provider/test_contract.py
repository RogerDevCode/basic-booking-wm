from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast
from unittest.mock import AsyncMock, patch

import pytest

from f.auth_provider.main import _main_async as main

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine

VALID_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


@pytest.mark.asyncio
async def test_auth_provider_generate_temp() -> None:
    mock_db = AsyncMock()
    # 1. SELECT provider
    mock_db.fetch.return_value = [{"name": "Dr. Test", "email": "test@test.com"}]

    async def mock_with_tenant(db: object, tid: str, op: Callable[[], Coroutine[Any, Any, object]]) -> object:
        return await op()

    with (
        patch("f.auth_provider.main.create_db_client", return_value=mock_db),
        patch("f.auth_provider.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args: dict[str, Any] = {"action": "admin_generate_temp", "provider_id": VALID_ID, "tenant_id": VALID_ID}

        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["provider_id"] == VALID_ID
        assert len(str(cast("dict[str, object]", result).get("tempPassword"))) == 4
        assert mock_db.execute.called  # Update password_hash
