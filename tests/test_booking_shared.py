from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest

from f.internal._booking_shared import get_mis_citas_text, query_my_bookings


@pytest.mark.asyncio
async def test_query_my_bookings_success() -> None:
    pg_url = "postgresql://test"
    client_id = "test-client"

    mock_db = AsyncMock()
    mock_db.fetch.return_value = [
        {
            "booking_id": "b12345678",
            "start_time": datetime(2026, 5, 20, 10, 0, tzinfo=UTC),
            "status": "confirmed",
            "provider_name": "Dr. Smith",
            "service_name": "Consultation",
            "tz_name": "America/Santiago",
        }
    ]

    with patch("f.internal._db_client.create_db_client", return_value=mock_db):
        res = await query_my_bookings(client_id, pg_url)

    assert len(res) == 1
    assert res[0]["provider_name"] == "Dr. Smith"
    mock_db.close.assert_called_once()


@pytest.mark.asyncio
async def test_get_mis_citas_text_format() -> None:
    client_id = "c1"
    pg_url = "pg://test"
    chat_id = "123"

    mock_rows = [
        {
            "booking_id": "1234567890",
            "start_time": datetime(2026, 5, 20, 10, 0, tzinfo=UTC),
            "status": "confirmed",
            "provider_name": "Dr. Smith",
            "service_name": "Consultation",
            "tz_name": "UTC",
        }
    ]

    with patch("f.internal._booking_shared.query_my_bookings", AsyncMock(return_value=mock_rows)):
        text = await get_mis_citas_text(client_id, pg_url, chat_id)

    assert text is not None
    assert "Dr. Smith" in text
    assert "Consultation" in text
    assert "Ref: `12-345-678`" in text


@pytest.mark.asyncio
async def test_get_mis_citas_text_empty() -> None:
    with patch("f.internal._booking_shared.query_my_bookings", AsyncMock(return_value=[])):
        text = await get_mis_citas_text("c1", "pg", "123")
    assert text is None
