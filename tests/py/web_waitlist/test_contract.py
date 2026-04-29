from typing import Any
from typing import cast, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.web_waitlist.main import main

VALID_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


@pytest.mark.asyncio
async def test_waitlist_join_success() -> None:
    mock_db = AsyncMock()
    # 1. resolve_client_id
    # 2. handle_join service lock
    # 3. handle_join check existing
    # 4. handle_join count for position
    # 5. handle_join insert
    mock_db.fetch.side_effect = [
        [{"user_id": VALID_ID, "client_id": "c1"}],  # resolve_client_id
        [{"1": 1}],  # lock service
        [],  # check existing
        [{"cnt": 5}],  # count for position
        [{"waitlist_id": "w1"}],  # insert result
    ]

    async def mock_with_tenant(db: object, tid: str, op: Any) -> object:
        return await op()

    with (
        patch("f.web_waitlist.main.create_db_client", return_value=mock_db),
        patch("f.web_waitlist.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args: dict[str, Any] = {"action": "join", "user_id": VALID_ID, "service_id": VALID_ID}

        err, result = main(args)

        assert err is None
        assert result is not None
        assert result["position"] == 6
        assert "Joined waitlist" in result["message"]
