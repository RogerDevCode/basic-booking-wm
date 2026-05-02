from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.provider_manage.main import _main_async as main

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine

VALID_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


@pytest.mark.asyncio
async def test_provider_manage_update_success() -> None:
    mock_db = AsyncMock()

    async def mock_with_tenant(db: object, tid: str, op: Callable[[], Coroutine[Any, Any, object]]) -> object:
        return await op()

    with (
        patch("f.provider_manage.main.create_db_client", return_value=mock_db),
        patch("f.provider_manage.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args: dict[str, Any] = {
            "action": "update_provider",
            "provider_id": VALID_ID,
            "name": "Updated Name",
            "specialty_id": VALID_ID,
        }

        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["updated"] is True
        assert mock_db.execute.called
