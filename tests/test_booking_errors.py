"""Tests for booking error hierarchy in f/services/booking/_booking_errors.py."""

from __future__ import annotations

import pytest

from f.services.booking._booking_errors import (
    BookingAlreadyCancelledError,
    BookingAlreadyRescheduledError,
    BookingClientAlreadyActiveError,
    BookingClientOverlapError,
    BookingError,
    BookingMissingParamsError,
    BookingNoServiceError,
    BookingNotFoundError,
    BookingPermissionError,
    BookingPrefetchBlockedError,
    BookingSlotUnavailableError,
)


class TestBookingErrorHierarchy:
    def test_booking_error_is_runtime_error(self) -> None:
        assert issubclass(BookingError, RuntimeError)

    def test_booking_not_found_inherits_booking_error(self) -> None:
        assert issubclass(BookingNotFoundError, BookingError)

    def test_booking_already_cancelled_inherits_booking_error(self) -> None:
        assert issubclass(BookingAlreadyCancelledError, BookingError)

    def test_booking_already_rescheduled_inherits_booking_error(self) -> None:
        assert issubclass(BookingAlreadyRescheduledError, BookingError)

    def test_booking_slot_unavailable_inherits_booking_error(self) -> None:
        assert issubclass(BookingSlotUnavailableError, BookingError)

    def test_booking_permission_inherits_booking_error(self) -> None:
        assert issubclass(BookingPermissionError, BookingError)

    def test_booking_client_overlap_inherits_booking_error(self) -> None:
        assert issubclass(BookingClientOverlapError, BookingError)

    def test_booking_client_already_active_inherits_booking_error(self) -> None:
        assert issubclass(BookingClientAlreadyActiveError, BookingError)

    def test_booking_no_service_inherits_booking_error(self) -> None:
        assert issubclass(BookingNoServiceError, BookingError)

    def test_booking_missing_params_inherits_booking_error(self) -> None:
        assert issubclass(BookingMissingParamsError, BookingError)

    def test_booking_prefetch_blocked_inherits_booking_error(self) -> None:
        assert issubclass(BookingPrefetchBlockedError, BookingError)


class TestBookingErrorCatchability:
    def test_catch_specific_catches_specific(self) -> None:
        with pytest.raises(BookingNotFoundError):
            raise BookingNotFoundError("not found")

    def test_catch_base_catches_all_subclasses(self) -> None:
        errors = [
            BookingNotFoundError("x"),
            BookingAlreadyCancelledError("x"),
            BookingAlreadyRescheduledError("x"),
            BookingSlotUnavailableError("x"),
            BookingPermissionError("x"),
            BookingClientOverlapError("x"),
            BookingClientAlreadyActiveError("x"),
            BookingNoServiceError("x"),
            BookingMissingParamsError("x"),
            BookingPrefetchBlockedError("reason"),
        ]
        for err in errors:
            with pytest.raises(BookingError):
                raise err

    def test_catch_runtime_error_catches_booking_error(self) -> None:
        with pytest.raises(RuntimeError):
            raise BookingSlotUnavailableError("slot taken")

    def test_subclass_does_not_catch_sibling(self) -> None:
        with pytest.raises(BookingNotFoundError):
            try:
                raise BookingNotFoundError("x")
            except BookingSlotUnavailableError:
                pass  # should NOT be caught here


class TestBookingPrefetchBlockedError:
    def test_reason_attribute_stored(self) -> None:
        err = BookingPrefetchBlockedError("already_booked")
        assert err.reason == "already_booked"

    def test_reason_in_str(self) -> None:
        err = BookingPrefetchBlockedError("already_booked")
        assert "already_booked" in str(err)

    def test_is_booking_error(self) -> None:
        err = BookingPrefetchBlockedError("already_booked")
        assert isinstance(err, BookingError)
