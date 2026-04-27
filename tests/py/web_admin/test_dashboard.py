from unittest.mock import AsyncMock, patch

import pytest

from f.web_admin_dashboard.main import main


@pytest.mark.asyncio
async def test_admin_dashboard_success() -> None:
    mock_db = AsyncMock()
    # 1. Verify Admin
    # 2. Main Stats
    # 3. No-Show Rate
    mock_db.fetch.side_effect = [
        [{"role": "admin"}],  # admin check
        [
            {
                "total_users": 10,
                "total_bookings": 5,
                "total_revenue_cents": 1000,
                "active_providers": 2,
                "pending_bookings": 1,
            }
        ],  # stats
        [{"no_show_count": 1, "total_processed": 10}],  # no-show rate
    ]

    async def mock_with_tenant(db: object, tid: str, op: object) -> object:
        return await op()

    with (
        patch("f.web_admin_dashboard.main.create_db_client", return_value=mock_db),
        patch("f.web_admin_dashboard.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args = {"admin_user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"}
        err, result = await main(args)

        assert err is None
        assert result["total_users"] == 10
        assert result["no_show_rate"] == "10.0"
