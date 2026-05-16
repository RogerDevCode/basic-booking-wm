from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from f.services.booking._booking_errors import (
    BookingAlreadyCancelledError,
    BookingAlreadyRescheduledError,
    BookingNotFoundError,
    BookingPermissionError,
    BookingSlotUnavailableError,
)
from f.services.booking._booking_models import (
    BookingCancelRequest,
    BookingCreateRequest,
    BookingRescheduleRequest,
    BookingResult,
)
from f.services.booking.core import cancel_booking, create_booking, reschedule_booking

# ── Constants ──────────────────────────────────────────────────────────────────

BOOKING_ID = "44444444-4444-4444-4444-444444444444"
CLIENT_ID = "22222222-2222-2222-2222-222222222222"
PROVIDER_ID = "11111111-1111-1111-1111-111111111111"
SERVICE_ID = "33333333-3333-3333-3333-333333333333"
OTHER_CLIENT_ID = "55555555-5555-5555-5555-555555555555"

# ── Helpers ─────────────────────────────────────────────────────────────────────


def _make_repo() -> MagicMock:
    repo = MagicMock()
    repo.exists = AsyncMock(return_value=False)
    repo.get_by_key = AsyncMock(return_value={"booking_id": BOOKING_ID, "status": "confirmed"})
    repo.is_available = AsyncMock(return_value=True)
    repo.insert = AsyncMock(return_value={"booking_id": BOOKING_ID, "status": "confirmed"})
    repo.get_booking = AsyncMock(
        return_value={
            "booking_id": BOOKING_ID,
            "status": "confirmed",
            "client_id": CLIENT_ID,
            "provider_id": PROVIDER_ID,
            "service_id": SERVICE_ID,
        }
    )
    repo.update_status = AsyncMock(return_value={"booking_id": BOOKING_ID, "status": "cancelled"})
    repo.reschedule = AsyncMock(return_value={"booking_id": BOOKING_ID, "status": "confirmed"})
    return repo


def _create_req(**overrides: object) -> BookingCreateRequest:
    base: dict[str, object] = dict(
        client_id=CLIENT_ID,
        provider_id=PROVIDER_ID,
        service_id=SERVICE_ID,
        start_time=datetime(2026, 6, 1, 10, 0, tzinfo=UTC),
        end_time=datetime(2026, 6, 1, 10, 30, tzinfo=UTC),
        idempotency_key="test-key-1",
    )
    base.update(overrides)
    return BookingCreateRequest(**base)  # type: ignore[arg-type]


def _cancel_req(**overrides: object) -> BookingCancelRequest:
    base: dict[str, object] = dict(booking_id=BOOKING_ID, actor="system")
    base.update(overrides)
    return BookingCancelRequest(**base)  # type: ignore[arg-type]


def _reschedule_req(**overrides: object) -> BookingRescheduleRequest:
    base: dict[str, object] = dict(
        booking_id=BOOKING_ID,
        new_start_time=datetime(2026, 6, 2, 11, 0, tzinfo=UTC),
        new_end_time=datetime(2026, 6, 2, 11, 30, tzinfo=UTC),
    )
    base.update(overrides)
    return BookingRescheduleRequest(**base)  # type: ignore[arg-type]


# ── create_booking ─────────────────────────────────────────────────────────────


class TestCreateBooking:
    @pytest.mark.asyncio
    async def test_idempotency_returns_existing_without_insert(self) -> None:
        """When the idempotency key exists, returns the existing booking without inserting."""
        repo = _make_repo()
        repo.exists = AsyncMock(return_value=True)

        result = await create_booking(_create_req(), repo)

        assert isinstance(result, BookingResult)
        assert result.booking_id == BOOKING_ID
        repo.insert.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_slot_unavailable_raises_slot_error(self) -> None:
        """GIST constraint violation in repo.insert raises BookingSlotUnavailableError."""
        repo = _make_repo()
        repo.insert = AsyncMock(side_effect=BookingSlotUnavailableError("Slot taken"))

        with pytest.raises(BookingSlotUnavailableError):
            await create_booking(_create_req(), repo)

    @pytest.mark.asyncio
    async def test_success_inserts_booking(self) -> None:
        """Happy path: insert is called."""
        repo = _make_repo()

        await create_booking(_create_req(), repo)

        repo.insert.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_success_returns_booking_result(self) -> None:
        """Return value is a typed BookingResult."""
        result = await create_booking(_create_req(), _make_repo())
        assert isinstance(result, BookingResult)
        assert result.status == "confirmed"


# ── cancel_booking ─────────────────────────────────────────────────────────────


class TestCancelBooking:
    @pytest.mark.asyncio
    async def test_booking_not_found_raises(self) -> None:
        """get_booking returning None raises BookingNotFoundError."""
        repo = _make_repo()
        repo.get_booking = AsyncMock(return_value=None)

        with pytest.raises(BookingNotFoundError):
            await cancel_booking(_cancel_req(), repo)

    @pytest.mark.asyncio
    async def test_already_cancelled_raises(self) -> None:
        """Cancelling an already-cancelled booking raises BookingAlreadyCancelledError."""
        repo = _make_repo()
        repo.get_booking = AsyncMock(
            return_value={"booking_id": BOOKING_ID, "status": "cancelled", "client_id": CLIENT_ID}
        )

        with pytest.raises(BookingAlreadyCancelledError):
            await cancel_booking(_cancel_req(), repo)

    @pytest.mark.asyncio
    async def test_wrong_actor_raises_permission_error(self) -> None:
        """Client trying to cancel another client's booking raises BookingPermissionError."""
        repo = _make_repo()
        req = _cancel_req(actor="client", actor_id=OTHER_CLIENT_ID)

        with pytest.raises(BookingPermissionError):
            await cancel_booking(req, repo)

    @pytest.mark.asyncio
    async def test_success_updates_status(self) -> None:
        """Happy path: update_status is called."""
        repo = _make_repo()

        await cancel_booking(_cancel_req(), repo)

        repo.update_status.assert_awaited_once_with(BOOKING_ID, "cancelled", None, "Cancelled by user", "system")

    @pytest.mark.asyncio
    async def test_success_returns_booking_result(self) -> None:
        """Return value is a typed BookingResult."""
        result = await cancel_booking(_cancel_req(), _make_repo())
        assert isinstance(result, BookingResult)
        assert result.status == "cancelled"


# ── reschedule_booking ─────────────────────────────────────────────────────────


class TestRescheduleBooking:
    @pytest.mark.asyncio
    async def test_booking_not_found_raises(self) -> None:
        """get_booking returning None raises BookingNotFoundError."""
        repo = _make_repo()
        repo.get_booking = AsyncMock(return_value=None)

        with pytest.raises(BookingNotFoundError):
            await reschedule_booking(_reschedule_req(), repo)

    @pytest.mark.asyncio
    async def test_already_rescheduled_raises(self) -> None:
        """Rescheduling an already-rescheduled booking raises BookingAlreadyRescheduledError."""
        repo = _make_repo()
        repo.get_booking = AsyncMock(
            return_value={"booking_id": BOOKING_ID, "status": "rescheduled", "client_id": CLIENT_ID}
        )

        with pytest.raises(BookingAlreadyRescheduledError):
            await reschedule_booking(_reschedule_req(), repo)

    @pytest.mark.asyncio
    async def test_new_slot_occupied_raises_slot_error(self) -> None:
        """GIST constraint violation in repo.reschedule raises BookingSlotUnavailableError."""
        repo = _make_repo()
        repo.reschedule = AsyncMock(side_effect=BookingSlotUnavailableError("New slot taken"))

        with pytest.raises(BookingSlotUnavailableError):
            await reschedule_booking(_reschedule_req(), repo)

    @pytest.mark.asyncio
    async def test_success_reschedules_booking(self) -> None:
        """Happy path: repo.reschedule is called."""
        repo = _make_repo()

        await reschedule_booking(_reschedule_req(), repo)

        repo.reschedule.assert_awaited_once()
