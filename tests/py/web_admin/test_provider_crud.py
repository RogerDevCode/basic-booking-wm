from typing import Any
from typing import cast, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.web_admin_provider_crud.main import main


@pytest.mark.asyncio
async def test_admin_provider_list_success() -> None:
    mock_db = AsyncMock()
    # 1. list_providers fetch
    mock_db.fetch.return_value = [
        {
            "id": "p1",
            "name": "Dr. Smith",
            "email": "s@s.com",
            "is_active": True,
            "created_at": "2026-05-01T10:00:00Z",
            "updated_at": "2026-05-01T10:00:00Z",
        }
    ]

    async def mock_with_admin(db: object, op: Any) -> object:
        return await op()

    with (
        patch("f.web_admin_provider_crud.main.create_db_client", return_value=mock_db),
        patch("f.web_admin_provider_crud.main.with_admin_context", side_effect=mock_with_admin),
    ):
        args: dict[str, Any] = {"action": "list"}
        # main returns result now, not (err, result)
        result = await main(args)
        assert result is not None

        assert result is not None
        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["name"] == "Dr. Smith"
