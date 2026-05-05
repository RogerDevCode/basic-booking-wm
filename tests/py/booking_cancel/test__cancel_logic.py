from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from f.booking_cancel._cancel_booking_logic import authorize_actor, execute_cancel_booking


@pytest.mark.asyncio
async def test_authorize_actor_client_success() -> None:
    input_data = AsyncMock()
    input_data.actor = "client"
    input_data.actor_id = "client-1"

    booking = {"client_id": "client-1", "provider_id": "prov-1"}

    err, _ = authorize_actor(input_data, booking)  # type: ignore
    assert err is None


@pytest.mark.asyncio
async def test_authorize_actor_mismatch() -> None:
    input_data = AsyncMock()
    input_data.actor = "client"
    input_data.actor_id = "wrong-client"

    booking = {"client_id": "client-1", "provider_id": "prov-1"}

    err, _ = authorize_actor(input_data, booking)  # type: ignore
    assert err is not None
    assert "unauthorized" in str(err)


@pytest.mark.asyncio
async def test_execute_cancel_booking_success() -> None:
    repo = AsyncMock()
    input_data = AsyncMock()
    input_data.booking_id = "bk-1"

    booking = {"status": "confirmed", "gcal_provider_event_id": None, "gcal_client_event_id": None}

    repo.lock_booking.return_value = "confirmed"
    repo.update_booking_status.return_value = {
        "booking_id": "bk-1",
        "status": "cancelled",
        "cancelled_by": "client",
        "cancellation_reason": "test",
    }

    err, res = await execute_cancel_booking(repo, input_data, booking)  # type: ignore

    assert err is None
    assert res is not None
    assert res["status"] == "cancelled"
    repo.insert_audit_trail.assert_called_once()


@pytest.mark.asyncio
async def test_execute_cancel_booking_already_cancelled() -> None:
    repo = AsyncMock()
    input_data = AsyncMock()
    input_data.booking_id = "bk-1"

    repo.lock_booking.return_value = "cancelled"

    err, res = await execute_cancel_booking(repo, input_data, {})  # type: ignore

    assert err is not None
    assert "already_cancelled" in str(err)
    assert res is None
