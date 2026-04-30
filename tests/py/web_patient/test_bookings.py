from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.web_patient_bookings.main import _main_async as main

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine

VALID_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


@pytest.mark.asyncio
async def test_patient_bookings_list_success() -> None:
    mock_db = AsyncMock()
    # 1. resolve_client_id
    # 2. get_patient_bookings main fetch
    # 3. get_patient_bookings count fetch
    mock_db.fetch.side_effect = [
        [{"client_id": "c1"}],  # resolve_client_id
        [
            {
                "booking_id": "b1",
                "start_time": "2026-05-01T10:00:00Z",
                "end_time": "2026-05-01T10:30:00Z",
                "status": "confirmed",
                "cancellation_reason": None,
                "provider_name": "Dr. Smith",
                "provider_specialty": "Cardio",
                "service_name": "Consult",
            }
        ],
        [{"count": 1}],
    ]

    async def mock_with_tenant(db: object, tid: str, op: Callable[[], Coroutine[Any, Any, object]]) -> object:
        return await op()

    with (
        patch("f.web_patient_bookings.main.create_db_client", return_value=mock_db),
        patch("f.web_patient_bookings.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args: dict[str, Any] = {"client_user_id": VALID_ID}
        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["total"] == 1
        # Result split into upcoming/past based on current time (mocking time would be better but let's assume now < May 2026)  # noqa: E501
        assert len(result["upcoming"]) + len(result["past"]) == 1
