from unittest.mock import AsyncMock, patch

import pytest

from f.admin_honorifics.main import main


@pytest.mark.asyncio
async def test_admin_honorifics_list() -> None:
    mock_db = AsyncMock()
    mock_db.fetch.return_value = [
        {
            "honorific_id": "h1",
            "code": "Dr.",
            "label": "Doctor",
            "gender": "M",
            "sort_order": 1,
            "is_active": True,
            "created_at": "2026-05-01T10:00:00Z",
        }
    ]

    async def mock_with_admin(db: object, op: object) -> object:
        return await op()

    with (
        patch("f.admin_honorifics.main.create_db_client", return_value=mock_db),
        patch("f.admin_honorifics.main.with_admin_context", side_effect=mock_with_admin),
    ):
        args = {"action": "list", "tenant_id": "t1"}
        err, result = await main(args)

        assert err is None
        assert len(result) == 1
        assert result[0]["code"] == "Dr."
