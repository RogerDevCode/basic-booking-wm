from typing import Any
from typing import cast
from unittest.mock import AsyncMock, patch

import pytest

from f.web_admin_regions.main import main


@pytest.mark.asyncio
async def test_admin_regions_list_success() -> None:
    mock_db = AsyncMock()
    # 1. list_regions fetch
    mock_db.fetch.return_value = [
        {"region_id": 1, "name": "Metropolitana", "code": "RM", "is_active": True, "sort_order": 1}
    ]

    with patch("f.web_admin_regions.main.create_db_client", return_value=mock_db):
        args: dict[str, Any] = {"action": "list_regions"}
        err, result = main(args)

        assert err is None
        assert result is not None
        assert result["count"] == 1
        assert result["regions"][0]["name"] == "Metropolitana"
