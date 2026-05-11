from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from f.services.booking._booking_errors import (
    BookingAlreadyRescheduledError,
    BookingNotFoundError,
    BookingPermissionError,
    BookingSlotUnavailableError,
)
from f.services.booking._booking_models import BookingResult
from f.services.booking.orchestrator import (
    _handle_cancelar_cita,
    _handle_crear_cita,
    _handle_reagendar_cita,
    route_intent,
)

BOOKING_ID = "44444444-4444-4444-4444-444444444444"
CLIENT_ID = "22222222-2222-2222-2222-222222222222"
PROVIDER_ID = "11111111-1111-1111-1111-111111111111"
SERVICE_ID = "33333333-3333-3333-3333-333333333333"

_OK_RESULT = BookingResult(booking_id=BOOKING_ID, status="confirmed")
_CANCELLED_RESULT = BookingResult(booking_id=BOOKING_ID, status="cancelled")


def _make_conn() -> AsyncMock:
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=[])
    conn.fetchrow = AsyncMock(return_value=None)
    conn.close = AsyncMock()
    return conn


def _make_repo() -> MagicMock:
    repo = MagicMock()
    repo.resolve_context = AsyncMock(return_value={})
    repo.get_specialties_for_booking = AsyncMock(return_value=[])
    repo.get_active_booking_for_client = AsyncMock(return_value=None)
    return repo


def _make_full_ctx_repo() -> MagicMock:
    repo = _make_repo()
    repo.resolve_context = AsyncMock(
        return_value={
            "client_id": CLIENT_ID,
            "provider_id": PROVIDER_ID,
            "service_id": SERVICE_ID,
            "date": "2026-06-01",
            "time": "10:00",
        }
    )
    return repo


# ── route_intent ───────────────────────────────────────────────────────────────


class TestRouteIntentUnknown:
    @pytest.mark.asyncio
    async def test_unknown_type_returns_desconocido_without_db(self) -> None:
        """Unknown intent type must return 'desconocido' before touching the DB."""
        result = await route_intent({"type": "foo_unknown"})
        assert result["action"] == "desconocido"
        assert result["success"] is False

    @pytest.mark.asyncio
    async def test_missing_type_defaults_to_desconocido(self) -> None:
        """An intent with no 'type' key is treated as desconocido."""
        result = await route_intent({})
        assert result["action"] == "desconocido"


# ── _handle_cancelar_cita ──────────────────────────────────────────────────────


class TestHandleCancelarCita:
    @pytest.mark.asyncio
    async def test_missing_booking_id_returns_error(self) -> None:
        """No booking_id in intent or entities → error, no DB call."""
        result = await _handle_cancelar_cita({"entities": {}}, _make_conn(), _make_repo())
        assert result["success"] is False
        assert "ID" in result["message"] or "id" in result["message"].lower()

    @pytest.mark.asyncio
    @patch(
        "f.services.booking.orchestrator.cancel_booking",
        side_effect=BookingNotFoundError("not found"),
    )
    async def test_booking_not_found_returns_error(self, _: object) -> None:
        """BookingNotFoundError from core → failure message."""
        result = await _handle_cancelar_cita(
            {"booking_id": BOOKING_ID, "entities": {}},
            _make_conn(),
            _make_repo(),
        )
        assert result["success"] is False
        assert "cancelar" in result["message"].lower()

    @pytest.mark.asyncio
    @patch(
        "f.services.booking.orchestrator.cancel_booking",
        side_effect=BookingPermissionError("unauthorized"),
    )
    async def test_unauthorized_returns_permission_message(self, _: object) -> None:
        """BookingPermissionError → explicit 'no tienes permiso' message."""
        result = await _handle_cancelar_cita(
            {"booking_id": BOOKING_ID, "entities": {}},
            _make_conn(),
            _make_repo(),
        )
        assert result["success"] is False
        assert "permiso" in result["message"].lower()

    @pytest.mark.asyncio
    @patch(
        "f.services.booking.orchestrator.cancel_booking",
        return_value=_CANCELLED_RESULT,
    )
    async def test_success_returns_success_message(self, _: object) -> None:
        """Successful cancellation → success=True with confirmation message."""
        result = await _handle_cancelar_cita(
            {"booking_id": BOOKING_ID, "entities": {}},
            _make_conn(),
            _make_repo(),
        )
        assert result["success"] is True
        assert "cancelada" in result["message"].lower()
        assert result["data"]["booking_id"] == BOOKING_ID


# ── _handle_crear_cita ─────────────────────────────────────────────────────────


class TestHandleCrearCita:
    @pytest.mark.asyncio
    async def test_missing_context_returns_specialty_menu(self) -> None:
        """Incomplete context (no provider/date) returns specialty selection menu."""
        result = await _handle_crear_cita({"entities": {}}, _make_conn(), _make_repo())
        assert result["success"] is False
        assert "inline_buttons" in result

    @pytest.mark.asyncio
    @patch(
        "f.services.booking.orchestrator.create_booking",
        side_effect=BookingSlotUnavailableError("slot taken"),
    )
    async def test_slot_unavailable_returns_error(self, _: object) -> None:
        """BookingSlotUnavailableError from core → slot unavailable message."""
        result = await _handle_crear_cita({"entities": {}}, _make_conn(), _make_full_ctx_repo())
        assert result["success"] is False
        assert "disponible" in result["message"].lower()

    @pytest.mark.asyncio
    @patch(
        "f.services.booking.orchestrator.create_booking",
        return_value=_OK_RESULT,
    )
    async def test_success_returns_confirmation_message(self, _: object) -> None:
        """Successful booking creation → success=True with date/time in message."""
        result = await _handle_crear_cita({"entities": {}}, _make_conn(), _make_full_ctx_repo())
        assert result["success"] is True
        assert "2026-06-01" in result["message"] or "10:00" in result["message"]


# ── _handle_reagendar_cita ─────────────────────────────────────────────────────


class TestHandleReagendarCita:
    @pytest.mark.asyncio
    async def test_missing_booking_id_returns_error(self) -> None:
        """No booking_id → error without touching core layer."""
        result = await _handle_reagendar_cita(
            {"entities": {}, "date": "2026-06-01", "time": "11:00"},
            _make_conn(),
            _make_repo(),
        )
        assert result["success"] is False

    @pytest.mark.asyncio
    async def test_missing_date_time_returns_error(self) -> None:
        """booking_id present but date/time missing → error."""
        result = await _handle_reagendar_cita(
            {"booking_id": BOOKING_ID, "entities": {}},
            _make_conn(),
            _make_repo(),
        )
        assert result["success"] is False

    @pytest.mark.asyncio
    @patch(
        "f.services.booking.orchestrator.reschedule_booking",
        side_effect=BookingAlreadyRescheduledError("already rescheduled"),
    )
    async def test_already_rescheduled_returns_error(self, _: object) -> None:
        """BookingAlreadyRescheduledError → failure with message."""
        result = await _handle_reagendar_cita(
            {"booking_id": BOOKING_ID, "entities": {}, "date": "2026-06-02", "time": "11:00"},
            _make_conn(),
            _make_repo(),
        )
        assert result["success"] is False
        assert "reagendar" in result["message"].lower()

    @pytest.mark.asyncio
    @patch(
        "f.services.booking.orchestrator.reschedule_booking",
        return_value=BookingResult(booking_id=BOOKING_ID, status="confirmed"),
    )
    async def test_success_returns_confirmation_message(self, _: object) -> None:
        """Successful reschedule → success=True with new date/time in message."""
        result = await _handle_reagendar_cita(
            {"booking_id": BOOKING_ID, "entities": {}, "date": "2026-06-02", "time": "11:00"},
            _make_conn(),
            _make_repo(),
        )
        assert result["success"] is True
        assert "reagendada" in result["message"].lower()
