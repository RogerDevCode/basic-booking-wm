from typing import Any
from typing import cast, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.noshow_trigger.main import main


@pytest.mark.asyncio
async def test_noshow_trigger_success() -> None:
    mock_db = AsyncMock()
    # 1. Fetch active providers
    # 2. Find expired confirmed (repo call inside processProvider)
    mock_db.fetch.side_effect = [
        [{"provider_id": "p1"}],  # providers
        [{"booking_id": "b1"}],  # expired bookings for p1
    ]

    async def mock_with_tenant(db: object, tid: str, op: Any) -> object:
        return await op()

    with (
        patch("f.noshow_trigger.main.create_db_client", return_value=mock_db),
        patch("f.noshow_trigger.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args: dict[str, Any] = {"lookback_minutes": 30, "dry_run": False}
        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["marked"] == 1
        assert "b1" in result["booking_ids"]
        assert mock_db.execute.called  # Mark as no-show + Audit
