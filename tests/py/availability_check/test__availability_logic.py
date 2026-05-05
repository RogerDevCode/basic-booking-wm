from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from f.availability_check._availability_logic import get_provider, get_provider_service_id


@pytest.mark.asyncio
async def test_get_provider_service_id_found() -> None:
    db = AsyncMock()
    db.fetch.return_value = [{"service_id": "svc-1"}]

    res = await get_provider_service_id(db, "prov-1")

    assert res == "svc-1"
    db.fetch.assert_called_once()


@pytest.mark.asyncio
async def test_get_provider_service_id_not_found() -> None:
    db = AsyncMock()
    db.fetch.return_value = []

    res = await get_provider_service_id(db, "prov-1")

    assert res is None


@pytest.mark.asyncio
async def test_get_provider_found() -> None:
    db = AsyncMock()
    db.fetch.return_value = [{"provider_id": "prov-1", "name": "Dr. Smith", "timezone": "America/New_York"}]

    res = await get_provider(db, "prov-1")

    assert res is not None
    assert res["name"] == "Dr. Smith"
    assert res["timezone"] == "America/New_York"


@pytest.mark.asyncio
async def test_get_provider_not_found() -> None:
    db = AsyncMock()
    db.fetch.return_value = []

    res = await get_provider(db, "prov-1")

    assert res is None
