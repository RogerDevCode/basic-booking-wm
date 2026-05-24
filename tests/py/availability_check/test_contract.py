from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from f.availability_check.main import main_async
from f.internal._config import DEFAULT_TIMEZONE


@pytest.mark.asyncio
async def test_availability_check_e2e_mocked() -> None:
    mock_db = AsyncMock()

    # Provider Data
    provider_row = {"provider_id": "p1", "name": "Dr. Smith", "timezone": DEFAULT_TIMEZONE}

    # Availability Data from engine
    mock_avail_result = {
        "date": "2026-05-01",
        "slots": [
            {"id": "s1", "label": "09:00", "start": "2026-05-01T09:00:00-06:00", "end": "2026-05-01T09:30:00-06:00"},
            {"id": "s2", "label": "09:30", "start": "2026-05-01T09:30:00-06:00", "end": "2026-05-01T10:00:00-06:00"},
        ],
        "total_available": 2,
        "total_booked": 0,
        "is_blocked": False,
        "block_reason": None,
    }

    with patch("f.availability_check.main.create_db_client", return_value=mock_db):
        with patch("f.availability_check.main.get_provider", AsyncMock(return_value=provider_row)):
            with patch("f.availability_check.main.get_provider_service_id", AsyncMock(return_value="svc-1")):
                with patch("f.availability_check.main.get_availability", AsyncMock(return_value=mock_avail_result)):
                    args: dict[str, Any] = {
                        "tenant_id": "00000000-0000-0000-0000-000000000001",
                        "provider_id": "00000000-0000-0000-0000-000000000002",
                        "date": "2026-05-01",
                    }

                    result = await main_async(args)

                    assert result["provider_name"] == "Dr. Smith"
                    assert result["timezone"] == DEFAULT_TIMEZONE
                    assert len(result["slots"]) == 2
                    assert result["total_available"] == 2


@pytest.mark.asyncio
async def test_availability_check_provider_not_found() -> None:
    mock_db = AsyncMock()

    with patch("f.availability_check.main.create_db_client", return_value=mock_db):
        with patch("f.availability_check.main.get_provider", AsyncMock(return_value=None)):
            args: dict[str, Any] = {
                "tenant_id": "00000000-0000-0000-0000-000000000001",
                "provider_id": "00000000-0000-0000-0000-000000000002",
                "date": "2026-05-01",
            }

            with pytest.raises(RuntimeError, match="not found"):
                await main_async(args)
