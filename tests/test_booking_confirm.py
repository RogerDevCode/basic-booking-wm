from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

if TYPE_CHECKING:
    from contextlib import AbstractContextManager

# ── Constants ──────────────────────────────────────────────────────────────────

_PROVIDER_ID = "prov-uuid-1111"
_SERVICE_ID = "svc-uuid-2222"
_CLIENT_ID = "cli-uuid-3333"
_BOOKING_ID = "book-uuid-4444"
_START_TIME = "2026-06-01T10:00:00+00:00"
_CHAT_ID = "123456789"

# ── Helpers ────────────────────────────────────────────────────────────────────


def _patch_resolve_service(service_id: str | None) -> AbstractContextManager[MagicMock]:
    return patch(
        "f.internal.booking_confirm.main._resolve_service_id",
        AsyncMock(return_value=service_id),
    )


def _make_booking_create_mock(
    *,
    err: object = None,
    result: dict[str, object] | None = None,
) -> AbstractContextManager[MagicMock]:
    async def _fake_booking_create(args: dict[str, object]) -> tuple[object, dict[str, object] | None]:
        return err, result

    return patch(
        "f.booking_create.main.main_async",
        side_effect=_fake_booking_create,
    )


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
            from f.internal.booking_confirm.main import _main_async

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
            from f.internal.booking_confirm.main import _main_async

            await _main_async(
                client_id=_CLIENT_ID,
                provider_id=_PROVIDER_ID,
                start_time=_START_TIME,
                chat_id=_CHAT_ID,
            )

        mock_resolve.assert_awaited_once_with(_PROVIDER_ID)


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
        with _patch_resolve_service(_SERVICE_ID), _make_booking_create_mock(result=booking_result):
            from f.internal.booking_confirm.main import _main_async

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
        """When booking_create returns an error, success=False with error message."""
        with _patch_resolve_service(_SERVICE_ID), _make_booking_create_mock(err=Exception("slot_taken")):
            from f.internal.booking_confirm.main import _main_async

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
        """When booking_create returns (None, None), success=False with sentinel error."""
        with _patch_resolve_service(_SERVICE_ID), _make_booking_create_mock(err=None, result=None):
            from f.internal.booking_confirm.main import _main_async

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
        captured_args: list[dict[str, object]] = []

        async def _capture(args: dict[str, object]) -> tuple[None, dict[str, object]]:
            captured_args.append(args)
            return None, {
                "booking_id": _BOOKING_ID,
                "provider_name": "P",
                "service_name": "S",
                "start_time": _START_TIME,
                "status": "pending",
                "end_time": "2026-06-01T10:30:00+00:00",
                "client_name": "C",
            }

        with _patch_resolve_service(_SERVICE_ID), patch("f.booking_create.main.main_async", side_effect=_capture):
            from f.internal.booking_confirm.main import _main_async

            await _main_async(
                client_id=_CLIENT_ID,
                provider_id=_PROVIDER_ID,
                start_time=_START_TIME,
                chat_id=_CHAT_ID,
            )

        assert len(captured_args) == 1
        assert captured_args[0]["idempotency_key"] == f"tg:{_CHAT_ID}:{_START_TIME}"

    @pytest.mark.asyncio
    async def test_booking_create_receives_channel_telegram(self) -> None:
        """booking_create is called with channel='telegram' and actor='client'."""
        captured_args: list[dict[str, object]] = []

        async def _capture(args: dict[str, object]) -> tuple[None, dict[str, object]]:
            captured_args.append(args)
            return None, {
                "booking_id": _BOOKING_ID,
                "provider_name": "P",
                "service_name": "S",
                "start_time": _START_TIME,
                "status": "pending",
                "end_time": "2026-06-01T10:30:00+00:00",
                "client_name": "C",
            }

        with _patch_resolve_service(_SERVICE_ID), patch("f.booking_create.main.main_async", side_effect=_capture):
            from f.internal.booking_confirm.main import _main_async

            await _main_async(
                client_id=_CLIENT_ID,
                provider_id=_PROVIDER_ID,
                start_time=_START_TIME,
                chat_id=_CHAT_ID,
            )

        assert captured_args[0]["channel"] == "telegram"
        assert captured_args[0]["actor"] == "client"


# ── Tests: service resolution DB integration ──────────────────────────────────


class TestBookingConfirmResolveService:
    @pytest.mark.asyncio
    async def test_resolve_service_queries_by_provider(self) -> None:
        """_resolve_service_id fetches from services table using provider_id."""
        db = _make_db_for_service(_SERVICE_ID)
        with _patch_db(db):
            from f.internal.booking_confirm.main import _resolve_service_id

            result = await _resolve_service_id(_PROVIDER_ID)

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

            result = await _resolve_service_id(_PROVIDER_ID)

        assert result is None

    @pytest.mark.asyncio
    async def test_resolve_service_closes_connection(self) -> None:
        """DB connection is always closed after service lookup."""
        db = _make_db_for_service(_SERVICE_ID)
        with _patch_db(db):
            from f.internal.booking_confirm.main import _resolve_service_id

            await _resolve_service_id(_PROVIDER_ID)

        db.close.assert_awaited_once()


# ── Tests: sync wrapper ────────────────────────────────────────────────────────


class TestBookingConfirmSyncWrapper:
    def test_main_sync_returns_success_dict(self) -> None:
        """main() is sync (WM-01) and returns dict on success."""
        booking_result: dict[str, object] = {
            "booking_id": _BOOKING_ID,
            "provider_name": "Dr. Smith",
            "service_name": "Consulta",
            "start_time": _START_TIME,
            "status": "pending",
            "end_time": "2026-06-01T10:30:00+00:00",
            "client_name": "Ana",
        }
        with _patch_resolve_service(_SERVICE_ID), _make_booking_create_mock(result=booking_result):
            from f.internal.booking_confirm.main import main

            result = main(
                client_id=_CLIENT_ID,
                provider_id=_PROVIDER_ID,
                start_time=_START_TIME,
                chat_id=_CHAT_ID,
            )

        assert isinstance(result, dict)
        assert result["success"] is True

    def test_main_is_not_coroutine(self) -> None:
        """main() must return a plain dict, not a coroutine (WM-01)."""
        import inspect

        from f.internal.booking_confirm.main import main

        result = main  # just check it's callable and sync
        assert callable(result)
        assert not inspect.iscoroutinefunction(main)
