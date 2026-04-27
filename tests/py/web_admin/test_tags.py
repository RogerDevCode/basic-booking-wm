from unittest.mock import AsyncMock, patch

import pytest

from f.web_admin_tags.main import main


@pytest.mark.asyncio
async def test_admin_tags_list_categories_success() -> None:
    mock_db = AsyncMock()
    # 1. verify_admin_access
    # 2. list_categories fetch
    mock_db.fetch.side_effect = [
        [{"role": "admin"}],  # admin check
        [
            {
                "category_id": "c1",
                "name": "Tags Medicas",
                "description": "D",
                "is_active": True,
                "sort_order": 1,
                "created_at": "2026-05-01T10:00:00Z",
                "tag_count": 5,
            }
        ],
    ]

    async def mock_with_tenant(db: object, tid: str, op: object) -> object:
        return await op()

    with (
        patch("f.web_admin_tags.main.create_db_client", return_value=mock_db),
        patch("f.web_admin_tags.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args = {"action": "list_categories", "admin_user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"}
        err, result = await main(args)

        assert err is None
        assert len(result) == 1
        assert result[0]["name"] == "Tags Medicas"
