from __future__ import annotations

import sys
from contextlib import contextmanager
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

# --- Setup wmill mock globally before importing module under test ---
wmill_mock = MagicMock()
wmill_mock.workflow = lambda f: f  # Just pass through the async function
wmill_mock.task_script = MagicMock()
sys.modules["wmill"] = wmill_mock

import pytest  # noqa: E402

from f.booking_create._booking_create_models import InputSchema as BookingCreateInput  # noqa: E402
from f.internal.booking_confirm.main import _main_async  # noqa: E402

if TYPE_CHECKING:
    from collections.abc import Iterator
    from contextlib import AbstractContextManager

# ── Constants ──────────────────────────────────────────────────────────────────

_PROVIDER_ID = "11111111-1111-1111-1111-111111111111"
_SERVICE_ID = "22222222-2222-2222-2222-222222222222"
_CLIENT_ID = "33333333-3333-3333-3333-333333333333"
_BOOKING_ID = "44444444-4444-4444-4444-444444444444"
_START_TIME = "2026-06-01T10:00:00+00:00"
_CHAT_ID = "123456789"

# ── Helpers ────────────────────────────────────────────────────────────────────


def _patch_resolve_service(service_id: str | None) -> AbstractContextManager[MagicMock]:
    return patch(
        "f.internal.booking_confirm.main._resolve_service_id",
        AsyncMock(return_value=service_id),
    )


@contextmanager
def _patch_execute_create_booking(
    *,
    err: object = None,
    result: dict[str, object] | None = None,
) -> Iterator[MagicMock]:
    async def _fake(*args: object, **kwargs: object) -> dict[str, object] | None:
        if err:
            raise Exception(str(err))
        return result

    with patch("f.internal.booking_confirm.main.execute_create_booking", side_effect=_fake) as m:
        yield m


def _make_db_for_service(service_id: str | None) -> MagicMock:
    db = MagicMock()
    if service_id:
        db.fetchrow = AsyncMock(return_value={"service_id": service_id})
    else:
        db.fetchrow = AsyncMock(return_value=None)
    db.close = AsyncMock()
    return db


def _patch_db(db: MagicMock) -> AbstractContextManager[MagicMock]:
    return patch(
        "f.internal.booking_confirm.main.create_db_client",
        AsyncMock(return_value=db),
    )


# ── Tests: service resolution ──────────────────────────────────────────────────


class TestBookingConfirmServiceResolution:
    @pytest.mark.asyncio
    async def test_no_service_for_provider_returns_error(self) -> None:
        """When no active service exists for provider, returns success=False."""
        with _patch_resolve_service(None):
            result = await _main_async(
                client_id=_CLIENT_ID,
                provider_id=_PROVIDER_ID,
                start_time=_START_TIME,
                chat_id=_CHAT_ID,
            )

        assert result["success"] is False
        assert result["error"] == "no_service_for_provider"

    @pytest.mark.asyncio
    async def test_service_resolution_uses_provider_id(self) -> None:
        """_resolve_service_id is called with the correct provider_id."""
        mock_resolve = AsyncMock(return_value=None)
        with patch("f.internal.booking_confirm.main._resolve_service_id", mock_resolve):
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
        booking_result: dict[str, object] = {
            "booking_id": _BOOKING_ID,
            "provider_name": "Dr. Smith",
            "service_name": "Consulta General",
            "start_time": _START_TIME,
            "status": "pending",
            "end_time": "2026-06-01T10:30:00+00:00",
            "client_name": "Ana García",
        }
        with _patch_resolve_service(_SERVICE_ID), _patch_execute_create_booking(result=booking_result):
            result = await _main_async(
                client_id=_CLIENT_ID,
                provider_id=_PROVIDER_ID,
                start_time=_START_TIME,
                chat_id=_CHAT_ID,
            )

        assert result["success"] is True
        assert result["booking_id"] == _BOOKING_ID
        assert result["provider_name"] == "Dr. Smith"
        assert result["service_name"] == "Consulta General"

    @pytest.mark.asyncio
    async def test_booking_create_failure_returns_error(self) -> None:
        """When booking_create raises an error, success=False with error message."""
        with _patch_resolve_service(_SERVICE_ID), _patch_execute_create_booking(err=Exception("slot_taken")):
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
        with _patch_resolve_service(_SERVICE_ID), _patch_execute_create_booking(err=None, result=None):
            result = await _main_async(
                client_id=_CLIENT_ID,
                provider_id=_PROVIDER_ID,
                start_time=_START_TIME,
                chat_id=_CHAT_ID,
            )

        assert result["success"] is False
        assert result["error"] == "no_result_from_booking_create"

    @pytest.mark.asyncio
    async def test_idempotency_key_uses_chat_and_start_time(self) -> None:
        """Idempotency key is formatted as 'tg:{chat_id}:{start_time}'."""
        captured_inputs: list[object] = []

        async def _capture(*args: object, **kwargs: object) -> dict[str, object]:
            captured_inputs.append(args[1] if args else kwargs.get("input_data"))
            return {
                "booking_id": _BOOKING_ID,
                "provider_name": "P",
                "service_name": "S",
                "start_time": _START_TIME,
                "status": "pending",
                "end_time": "2026-06-01T10:30:00+00:00",
                "client_name": "C",
            }

        with (
            _patch_resolve_service(_SERVICE_ID),
            patch("f.internal.booking_confirm.main.execute_create_booking", side_effect=_capture),
        ):
            await _main_async(
                client_id=_CLIENT_ID,
                provider_id=_PROVIDER_ID,
                start_time=_START_TIME,
                chat_id=_CHAT_ID,
            )

        assert len(captured_inputs) == 1
        input_data = captured_inputs[0]
        assert isinstance(input_data, BookingCreateInput)
        assert input_data.idempotency_key == f"tg:{_CHAT_ID}:{_START_TIME}"

    @pytest.mark.asyncio
    async def test_booking_create_receives_channel_telegram(self) -> None:
        """booking_create is called with channel='telegram' and actor='client'."""
        captured_inputs: list[object] = []

        async def _capture(*args: object, **kwargs: object) -> dict[str, object]:
            captured_inputs.append(args[1] if args else kwargs.get("input_data"))
            return {
                "booking_id": _BOOKING_ID,
                "provider_name": "P",
                "service_name": "S",
                "start_time": _START_TIME,
                "status": "pending",
                "end_time": "2026-06-01T10:30:00+00:00",
                "client_name": "C",
            }

        with (
            _patch_resolve_service(_SERVICE_ID),
            patch("f.internal.booking_confirm.main.execute_create_booking", side_effect=_capture),
        ):
            await _main_async(
                client_id=_CLIENT_ID,
                provider_id=_PROVIDER_ID,
                start_time=_START_TIME,
                chat_id=_CHAT_ID,
            )

        input_data = captured_inputs[0]
        assert isinstance(input_data, BookingCreateInput)
        assert input_data.channel == "telegram"
        assert input_data.actor == "client"


# ── Tests: service resolution DB integration ──────────────────────────────────


class TestBookingConfirmResolveService:
    @pytest.mark.asyncio
    async def test_resolve_service_queries_by_provider(self) -> None:
        """_resolve_service_id fetches from services table using provider_id."""
        db = _make_db_for_service(_SERVICE_ID)
        with _patch_db(db):
            from f.internal.booking_confirm.main import _resolve_service_id

            result = await _resolve_service_id(db, _PROVIDER_ID)

        assert result == _SERVICE_ID
        db.fetchrow.assert_awaited_once()
        call_args = db.fetchrow.call_args
        assert _PROVIDER_ID in str(call_args)

    @pytest.mark.asyncio
    async def test_resolve_service_returns_none_when_not_found(self) -> None:
        """Returns None when fetchrow finds no matching service."""
        db = _make_db_for_service(None)
        with _patch_db(db):
            from f.internal.booking_confirm.main import _resolve_service_id

            result = await _resolve_service_id(db, _PROVIDER_ID)

        assert result is None

    @pytest.mark.asyncio
    async def test_resolve_service_does_not_close_connection(self) -> None:
        """_resolve_service_id no longer manages connection lifecycle."""
        db = _make_db_for_service(_SERVICE_ID)
        with _patch_db(db):
            from f.internal.booking_confirm.main import _resolve_service_id

            await _resolve_service_id(db, _PROVIDER_ID)

        db.close.assert_not_awaited()
