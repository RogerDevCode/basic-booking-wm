from typing import Any
from typing import cast, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.web_provider_dashboard.main import main

VALID_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


@pytest.mark.asyncio
async def test_provider_dashboard_success() -> None:
    mock_db = AsyncMock()
    # 1. Resolve Provider
    # 2. Fetch Agenda
    # 3. Monthly Stats
    mock_db.fetch.side_effect = [
        [{"provider_id": "p1", "name": "Dr. Smith", "specialty": "Cardio"}],  # provider
        [
            {
                "booking_id": "b1",
                "start_time": "2026-05-01T10:00:00Z",
                "end_time": "2026-05-01T10:30:00Z",
                "status": "confirmed",
                "client_name": "Patient",
                "service_name": "Consult",
            }
        ],  # agenda
        [{"month_completed": 10, "month_no_show": 1, "month_total": 11}],  # stats
    ]

    async def mock_with_tenant(db: object, tid: str, op: Any) -> object:
        return await op()

    with (
        patch("f.web_provider_dashboard.main.create_db_client", return_value=mock_db),
        patch("f.web_provider_dashboard.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args: dict[str, Any] = {"provider_user_id": VALID_ID, "date": "2026-05-01"}
        err, result = main(args)

        assert err is None
        assert result is not None
        assert result["provider_id"] == "p1"
        assert len(result["agenda"]) == 1
        assert result is not None
        assert result["stats"]["month_completed"] == 10
        assert result["stats"]["attendance_rate"] == "90.9"
