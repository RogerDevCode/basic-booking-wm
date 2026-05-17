from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest

from f.internal._booking_shared import get_mis_citas_text, query_my_bookings, resolve_provider_by_name


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


# ============================================================================
# resolve_provider_by_name — Smart Pre-fill Tests
# ============================================================================


@pytest.mark.asyncio
async def test_resolve_provider_exact_match_single() -> None:
    """Exact name match returns one provider with specialty info."""
    mock_db = AsyncMock()
    mock_db.fetch.return_value = [
        {
            "provider_id": "uuid-001",
            "name": "Dr. Gallegos",
            "specialty_id": "spec-cardio",
            "specialty_name": "Cardiología",
        }
    ]

    with patch("f.internal._db_client.create_db_client", return_value=mock_db):
        results = await resolve_provider_by_name("Gallegos", "postgresql://test")

    assert len(results) == 1
    assert results[0]["provider_id"] == "uuid-001"
    assert results[0]["name"] == "Dr. Gallegos"
    assert results[0]["specialty_name"] == "Cardiología"
    mock_db.close.assert_called_once()


@pytest.mark.asyncio
async def test_resolve_provider_partial_match() -> None:
    """Partial name fragment matches via ILIKE."""
    mock_db = AsyncMock()
    mock_db.fetch.return_value = [
        {
            "provider_id": "uuid-002",
            "name": "Dra. María Gallegos",
            "specialty_id": "spec-derma",
            "specialty_name": "Dermatología",
        }
    ]

    with patch("f.internal._db_client.create_db_client", return_value=mock_db):
        results = await resolve_provider_by_name("maria gallegos", "postgresql://test")

    assert len(results) == 1
    assert "Gallegos" in str(results[0]["name"])


@pytest.mark.asyncio
async def test_resolve_provider_no_match() -> None:
    """Non-existent name returns empty list."""
    mock_db = AsyncMock()
    mock_db.fetch.return_value = []

    with patch("f.internal._db_client.create_db_client", return_value=mock_db):
        results = await resolve_provider_by_name("DoctorInexistente", "postgresql://test")

    assert results == []
    mock_db.close.assert_called_once()


@pytest.mark.asyncio
async def test_resolve_provider_multiple_matches() -> None:
    """Ambiguous name returns all matches for user to choose."""
    mock_db = AsyncMock()
    mock_db.fetch.return_value = [
        {
            "provider_id": "uuid-001",
            "name": "Dr. Juan Pérez",
            "specialty_id": "spec-cardio",
            "specialty_name": "Cardiología",
        },
        {
            "provider_id": "uuid-002",
            "name": "Dra. Ana Pérez",
            "specialty_id": "spec-derma",
            "specialty_name": "Dermatología",
        },
    ]

    with patch("f.internal._db_client.create_db_client", return_value=mock_db):
        results = await resolve_provider_by_name("Pérez", "postgresql://test")

    assert len(results) == 2
    assert results[0]["name"] == "Dr. Juan Pérez"
    assert results[1]["name"] == "Dra. Ana Pérez"


@pytest.mark.asyncio
async def test_resolve_provider_excludes_inactive() -> None:
    """Inactive providers are not returned."""
    mock_db = AsyncMock()
    mock_db.fetch.return_value = []

    with patch("f.internal._db_client.create_db_client", return_value=mock_db):
        results = await resolve_provider_by_name("inactive_doc", "postgresql://test")

    assert results == []
    mock_db.fetch.assert_called_once()
    sql = mock_db.fetch.call_args[0][0]
    assert "is_active = true" in sql


@pytest.mark.asyncio
async def test_resolve_provider_db_error_raises() -> None:
    """DB failure propagates as RuntimeError."""
    mock_db = AsyncMock()
    mock_db.fetch.side_effect = ConnectionError("DB down")

    with patch("f.internal._db_client.create_db_client", return_value=mock_db):
        with pytest.raises(RuntimeError, match="resolve_provider_failed"):
            await resolve_provider_by_name("Gallegos", "postgresql://test")

    mock_db.close.assert_called_once()
