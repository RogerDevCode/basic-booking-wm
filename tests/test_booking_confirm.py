from __future__ import annotations

import sys
from contextlib import AbstractContextManager, contextmanager
from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, MagicMock, patch

if TYPE_CHECKING:
    from collections.abc import Generator

# --- Setup wmill mock globally before importing module under test ---
wmill_mock = MagicMock()


def _wf(f: Any) -> Any:
    return f


wmill_mock.workflow = _wf
wmill_mock.task_script = MagicMock()
sys.modules["wmill"] = wmill_mock

import pytest  # noqa: E402

from f.internal.booking_confirm.main import _main_async  # noqa: E402
from f.services.booking._booking_models import (  # noqa: E402
    BookingCreateRequest,
    BookingResult,
)

# ── Constants ──────────────────────────────────────────────────────────────────

_PROVIDER_ID = "11111111-1111-1111-1111-111111111111"
_SERVICE_ID = "22222222-2222-2222-2222-222222222222"
_CLIENT_ID = "33333333-3333-3333-3333-333333333333"
_BOOKING_ID = "44444444-4444-4444-4444-444444444444"
_START_TIME = "2026-06-01T10:00:00+00:00"
_CHAT_ID = "123456789"

# ── Helpers ────────────────────────────────────────────────────────────────────


def _patch_resolve_service(service_id: str | None) -> AbstractContextManager[MagicMock]:
    from f.services.booking._booking_errors import BookingNoServiceError

    if service_id:
        return patch("f.internal.booking_confirm.main._resolve_service", AsyncMock(return_value=(service_id, 30)))
    return patch(
        "f.internal.booking_confirm.main._resolve_service",
        AsyncMock(side_effect=BookingNoServiceError("no_service_for_provider")),
    )


@contextmanager
def _patch_create_booking(
    *,
    err: object = None,
    result: BookingResult | None = None,
) -> Generator[MagicMock]:
    async def _fake(*args: object, **kwargs: object) -> BookingResult | None:
        if err:
            raise Exception(str(err))
        return result

    with patch("f.internal.booking_confirm.main.create_booking", side_effect=_fake) as m:
        yield m


def _make_db_for_service(service_id: str | None) -> MagicMock:
    db = MagicMock()

    async def _fetchrow_side_effect(query: str, *args: object) -> dict[str, object] | None:
        if "conversation_states" in query:
            return {
                "booking_state": {"name": "confirming"},
                "active_flow": "booking",
                "booking_draft": {},
                "pending_data": {},
                "message_id": 1234,
                "version": 1,
            }
        if "services" in query or "service_id" in query:
            if service_id:
                return {
                    "service_id": service_id,
                    "duration_minutes": 30,
                    "provider_name": "Dr. Smith",
                    "service_name": "Consulta General",
                }
            return None
        # Default fallback
        if service_id:
            return {
                "service_id": service_id,
                "duration_minutes": 30,
                "provider_name": "Dr. Smith",
                "service_name": "Consulta General",
            }
        return None

    db.fetchrow = AsyncMock(side_effect=_fetchrow_side_effect)
    db.execute = AsyncMock()
    db.close = AsyncMock()
    return db


def _patch_db(db: MagicMock) -> AbstractContextManager[MagicMock]:
    return patch(
        "f.internal.booking_confirm.main.create_db_client",
        AsyncMock(return_value=db),
    )


@contextmanager
def _patch_repo() -> Generator[MagicMock]:
    with patch("f.internal.booking_confirm.main.PgBookingRepo") as mock_repo_cls:
        mock_instance = mock_repo_cls.return_value
        mock_instance.get_active_booking_for_client = AsyncMock(return_value=None)
        yield mock_repo_cls


# ── Tests: service resolution ──────────────────────────────────────────────────


class TestBookingConfirmServiceResolution:
    @pytest.mark.asyncio
    async def test_no_service_for_provider_returns_error(self) -> None:
        """When no active service exists for provider, returns success=False."""
        db = _make_db_for_service(None)
        with _patch_resolve_service(None), _patch_db(db):
            result = await _main_async(
                client_id=_CLIENT_ID,
                provider_id=_PROVIDER_ID,
                start_time=_START_TIME,
                chat_id=_CHAT_ID,
            )

        assert result["success"] is False
        assert "no_service_for_provider" in str(result["error"])

    @pytest.mark.asyncio
    async def test_service_resolution_uses_provider_id(self) -> None:
        """_resolve_service is called once with the correct provider_id."""
        from f.services.booking._booking_errors import BookingNoServiceError

        mock_resolve = AsyncMock(side_effect=BookingNoServiceError("no_service_for_provider"))
        db = _make_db_for_service(None)
        with patch("f.internal.booking_confirm.main._resolve_service", mock_resolve), _patch_db(db):
            await _main_async(
                client_id=_CLIENT_ID,
                provider_id=_PROVIDER_ID,
                start_time=_START_TIME,
                chat_id=_CHAT_ID,
            )

        mock_resolve.assert_awaited_once()
        assert mock_resolve.await_args is not None
        assert mock_resolve.await_args.args[1] == _PROVIDER_ID


# ── Tests: booking creation delegation ────────────────────────────────────────


class TestBookingConfirmDelegation:
    @pytest.mark.asyncio
    async def test_successful_booking_returns_success_true(self) -> None:
        """Happy path: service found, booking_create succeeds."""
        booking_result = BookingResult(booking_id=_BOOKING_ID, status="confirmed")
        db = _make_db_for_service(_SERVICE_ID)
        with (
            _patch_resolve_service(_SERVICE_ID),
            _patch_create_booking(result=booking_result),
            _patch_db(db),
            _patch_repo(),
        ):
            result = await _main_async(
                client_id=_CLIENT_ID,
                provider_id=_PROVIDER_ID,
                start_time=_START_TIME,
                chat_id=_CHAT_ID,
            )

        assert result["success"] is True
        assert result["booking_id"] == _BOOKING_ID

    @pytest.mark.asyncio
    async def test_booking_create_failure_returns_error(self) -> None:
        """When booking_create raises an error, success=False with error message."""
        db = _make_db_for_service(_SERVICE_ID)
        with (
            _patch_resolve_service(_SERVICE_ID),
            _patch_create_booking(err=Exception("slot_taken")),
            _patch_repo(),
            _patch_db(db),
        ):
            result = await _main_async(
                client_id=_CLIENT_ID,
                provider_id=_PROVIDER_ID,
                start_time=_START_TIME,
                chat_id=_CHAT_ID,
            )

        assert result["success"] is False
        assert "slot_taken" in str(result["error"])

    @pytest.mark.asyncio
    async def test_booking_create_returns_none_result(self) -> None:
        """When booking_create returns None, success=False with sentinel error."""
        db = _make_db_for_service(_SERVICE_ID)
        with (
            _patch_resolve_service(_SERVICE_ID),
            _patch_create_booking(err=None, result=None),
            _patch_db(db),
            _patch_repo(),
        ):
            result = await _main_async(
                client_id=_CLIENT_ID,
                provider_id=_PROVIDER_ID,
                start_time=_START_TIME,
                chat_id=_CHAT_ID,
            )

        assert result["success"] is False
        assert "no_result_from_booking_create" in str(result["error"])

    @pytest.mark.asyncio
    async def test_idempotency_key_uses_chat_and_start_time(self) -> None:
        """Idempotency key is formatted as 'tg:{chat_id}:{start_time}'."""
        captured_inputs: list[object] = []

        async def _capture(*args: object, **kwargs: object) -> BookingResult:
            captured_inputs.append(args[0] if args else kwargs.get("data"))
            return BookingResult(booking_id=_BOOKING_ID, status="confirmed")

        db = _make_db_for_service(_SERVICE_ID)
        with (
            _patch_resolve_service(_SERVICE_ID),
            patch("f.internal.booking_confirm.main.create_booking", side_effect=_capture),
            _patch_repo(),
            _patch_db(db),
        ):
            await _main_async(
                client_id=_CLIENT_ID,
                provider_id=_PROVIDER_ID,
                start_time=_START_TIME,
                chat_id=_CHAT_ID,
            )

        assert len(captured_inputs) == 1
        input_data = captured_inputs[0]
        assert isinstance(input_data, BookingCreateRequest)
        assert input_data.idempotency_key == f"tg:{_CHAT_ID}:{_START_TIME}"


# ── Tests: service resolution DB integration ──────────────────────────────────


class TestBookingConfirmResolveService:
    @pytest.mark.asyncio
    async def test_resolve_service_queries_by_provider(self) -> None:
        """_resolve_service fetches from services table using provider_id."""
        db = _make_db_for_service(_SERVICE_ID)
        with _patch_db(db):
            from f.internal.booking_confirm.main import _resolve_service

            result = await _resolve_service(db, _PROVIDER_ID)

        assert result == (_SERVICE_ID, 30)
        db.fetchrow.assert_awaited_once()
        call_args = db.fetchrow.call_args
        assert _PROVIDER_ID in str(call_args)

    @pytest.mark.asyncio
    async def test_resolve_service_raises_when_not_found(self) -> None:
        """Raises BookingNoServiceError when fetchrow finds no matching service."""
        from f.services.booking._booking_errors import BookingNoServiceError

        db = _make_db_for_service(None)
        with _patch_db(db):
            from f.internal.booking_confirm.main import _resolve_service

            with pytest.raises(BookingNoServiceError):
                await _resolve_service(db, _PROVIDER_ID)

    @pytest.mark.asyncio
    async def test_resolve_service_does_not_close_connection(self) -> None:
        """_resolve_service no longer manages connection lifecycle."""
        db = _make_db_for_service(_SERVICE_ID)
        with _patch_db(db):
            from f.internal.booking_confirm.main import _resolve_service

            await _resolve_service(db, _PROVIDER_ID)

        db.close.assert_not_awaited()
