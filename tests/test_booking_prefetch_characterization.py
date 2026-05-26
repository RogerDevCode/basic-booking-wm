"""Characterization tests for booking_prefetch._main_async.

These tests document CURRENT behavior before refactoring (FASE 0 of PLAN_LAW09_FINAL).
They are intentionally descriptive, not prescriptive — they capture what the module
does today so that FASE 3 refactoring can verify nothing regresses.
"""

from __future__ import annotations

import sys
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock, patch

from f.internal._config import DEFAULT_TIMEZONE

# Mock wmill before importing the module under test
_wmill_mock = MagicMock()
sys.modules.setdefault("wmill", _wmill_mock)

import pytest  # noqa: E402

from f.internal.booking_prefetch.main import (  # noqa: E402
    _main_async,
    _resolve_doctor_from_selection,
    _resolve_specialty_from_selection,
    _slot_label,
)

# ── Constants ──────────────────────────────────────────────────────────────────

_PG_URL = "postgresql://test:test@localhost/test"
_SPECIALTY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
_DOCTOR_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
_SERVICE_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc"
_CLIENT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd"
_BOOKING_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"

_SPECIALTY_ROWS = [
    {"specialty_id": _SPECIALTY_ID, "name": "Psicología", "sort_order": 1},
]
_DOCTOR_ROWS = [
    {"provider_id": _DOCTOR_ID, "name": "Dr. Test"},
]


def _make_db(
    *,
    fetch_return: list[Any] | None = None,
    fetchrow_return: Any = None,
) -> MagicMock:
    db = MagicMock()
    db.fetch = AsyncMock(return_value=fetch_return or [])
    db.fetchrow = AsyncMock(return_value=fetchrow_return)
    db.close = AsyncMock()
    return db


# ── Pure function tests ────────────────────────────────────────────────────────


class TestResolveSpecialtyFromSelection:
    def test_resolve_specialty_from_selection_numeric_returns_id(self) -> None:
        items: list[dict[str, object]] = [{"id": _SPECIALTY_ID, "name": "Psicología"}]
        result = _resolve_specialty_from_selection("1", items)
        assert result == _SPECIALTY_ID

    def test_resolve_specialty_from_selection_out_of_range_returns_none(self) -> None:
        items: list[dict[str, object]] = [{"id": _SPECIALTY_ID, "name": "Psicología"}]
        result = _resolve_specialty_from_selection("99", items)
        assert result is None

    def test_resolve_specialty_from_selection_spec_prefix_resolves_without_items(self) -> None:
        # BUG FIXED: spec:UUID now resolves directly even with empty state_items
        result = _resolve_specialty_from_selection(f"spec:{_SPECIALTY_ID}", [])
        assert result == _SPECIALTY_ID

    def test_resolve_specialty_from_selection_none_input_returns_none(self) -> None:
        assert _resolve_specialty_from_selection(None, []) is None

    def test_resolve_specialty_from_selection_empty_items_returns_none(self) -> None:
        assert _resolve_specialty_from_selection("1", []) is None


class TestResolveDoctorFromSelection:
    def test_resolve_doctor_from_selection_numeric_returns_id(self) -> None:
        items: list[dict[str, object]] = [{"id": _DOCTOR_ID, "name": "Dr. Test"}]
        result = _resolve_doctor_from_selection("1", items)
        assert result == _DOCTOR_ID

    def test_resolve_doctor_from_selection_doc_prefix_resolves_without_items(self) -> None:
        # BUG FIXED: doc:UUID now resolves directly even with empty state_items
        result = _resolve_doctor_from_selection(f"doc:{_DOCTOR_ID}", [])
        assert result == _DOCTOR_ID

    def test_resolve_doctor_from_selection_out_of_range_returns_none(self) -> None:
        items: list[dict[str, object]] = [{"id": _DOCTOR_ID, "name": "Dr. Test"}]
        result = _resolve_doctor_from_selection("99", items)
        assert result is None

    def test_resolve_doctor_from_selection_none_returns_none(self) -> None:
        assert _resolve_doctor_from_selection(None, []) is None


class TestSlotLabel:
    def test_slot_label_formats_utc_correctly(self) -> None:
        # 2026-06-01T14:00:00+00:00 is a Monday
        label = _slot_label("2026-06-01T14:00:00+00:00", "UTC")
        assert "14:00" in label
        assert "Jun" in label

    def test_slot_label_applies_timezone_offset(self) -> None:
        # America/Santiago is UTC-4 in winter
        label_utc = _slot_label("2026-06-01T16:00:00+00:00", "UTC")
        label_santiago = _slot_label("2026-06-01T16:00:00+00:00", DEFAULT_TIMEZONE)
        assert label_utc != label_santiago


# ── _main_async: idle state ────────────────────────────────────────────────────


class TestPrefetchIdleState:
    @pytest.mark.asyncio
    async def test_idle_state_returns_specialties(self) -> None:
        db = _make_db(fetch_return=_SPECIALTY_ROWS)
        with patch("f.internal.booking_prefetch.main._connect", AsyncMock(return_value=db)):
            result = await _main_async(
                booking_state={"name": "idle"},
                booking_draft=None,
                pg_url=_PG_URL,
            )
        assert result["prefetch_type"] == "specialties"
        assert isinstance(result["items"], list)
        assert len(cast("list[object]", result["items"])) == 1
        assert result["items"][0]["id"] == _SPECIALTY_ID

    @pytest.mark.asyncio
    async def test_idle_state_empty_db_returns_empty_items(self) -> None:
        db = _make_db(fetch_return=[])
        with patch("f.internal.booking_prefetch.main._connect", AsyncMock(return_value=db)):
            result = await _main_async(
                booking_state={"name": "idle"},
                booking_draft=None,
                pg_url=_PG_URL,
            )
        assert result["prefetch_type"] == "specialties"
        assert result["items"] == []

    @pytest.mark.asyncio
    async def test_none_booking_state_treated_as_idle(self) -> None:
        db = _make_db(fetch_return=_SPECIALTY_ROWS)
        with patch("f.internal.booking_prefetch.main._connect", AsyncMock(return_value=db)):
            result = await _main_async(
                booking_state=None,
                booking_draft=None,
                pg_url=_PG_URL,
            )
        assert result["prefetch_type"] == "specialties"

    @pytest.mark.asyncio
    async def test_cmd_agendar_input_forces_idle_prefetch(self) -> None:
        db = _make_db(fetch_return=_SPECIALTY_ROWS)
        with patch("f.internal.booking_prefetch.main._connect", AsyncMock(return_value=db)):
            result = await _main_async(
                booking_state={"name": "selecting_doctor"},
                booking_draft=None,
                pg_url=_PG_URL,
                user_input="cmd:agendar|session123",
            )
        assert result["prefetch_type"] == "specialties"
        assert len(cast("list[object]", result["items"])) == 1


# ── _main_async: selecting_specialty state ─────────────────────────────────────


class TestPrefetchSelectingSpecialtyState:
    @pytest.mark.asyncio
    async def test_selecting_specialty_resolves_and_fetches_doctors(self) -> None:
        state: dict[str, object] = {
            "name": "selecting_specialty",
            "items": [{"id": _SPECIALTY_ID, "name": "Psicología"}],
        }
        db = _make_db(fetch_return=_DOCTOR_ROWS)
        with patch("f.internal.booking_prefetch.main._connect", AsyncMock(return_value=db)):
            result = await _main_async(
                booking_state=state,
                booking_draft=None,
                pg_url=_PG_URL,
                user_input="1",
            )
        assert result["prefetch_type"] == "doctors"
        assert result["resolved_specialty_id"] == _SPECIALTY_ID
        assert len(cast("list[object]", result["items"])) == 1

    @pytest.mark.asyncio
    async def test_selecting_specialty_unresolvable_input_falls_through(self) -> None:
        # User typed something that can't be resolved → falls to no-match → empty items
        state: dict[str, object] = {"name": "selecting_specialty", "items": []}
        db = _make_db()
        with patch("f.internal.booking_prefetch.main._connect", AsyncMock(return_value=db)):
            result = await _main_async(
                booking_state=state,
                booking_draft=None,
                pg_url=_PG_URL,
                user_input="algo_invalido",
            )
        # specialty can't be resolved → falls through to no-match
        assert result["items"] == []
        assert result["prefetch_type"] is None


# ── _main_async: selecting_doctor state ───────────────────────────────────────


class TestPrefetchSelectingDoctorState:
    @pytest.mark.asyncio
    async def test_selecting_doctor_with_active_booking_does_not_block_early(self) -> None:
        state: dict[str, object] = {
            "name": "selecting_doctor",
            "items": [{"id": _DOCTOR_ID, "name": "Dr. Test"}],
        }
        db = _make_db()
        fake_slots = [
            {"id": "2026-06-01T10:00:00+00:00", "label": "Lun 1 Jun · 10:00", "start_time": "2026-06-01T10:00:00+00:00"}
        ]
        with (
            patch("f.internal.booking_prefetch.main._connect", AsyncMock(return_value=db)),
            patch(
                "f.internal.booking_prefetch.main._fetch_slots_for_doctor",
                AsyncMock(return_value=fake_slots),
            ),
        ):
            result = await _main_async(
                booking_state=state,
                booking_draft=None,
                pg_url=_PG_URL,
                user_input="1",
                client_id=_CLIENT_ID,
            )
        assert result["items"] == fake_slots
        assert result["prefetch_type"] == "time_slots"

    @pytest.mark.asyncio
    async def test_selecting_doctor_no_active_booking_returns_slots(self) -> None:
        state: dict[str, object] = {
            "name": "selecting_doctor",
            "items": [{"id": _DOCTOR_ID, "name": "Dr. Test"}],
        }
        db = _make_db()
        fake_slots = [
            {"id": "2026-06-01T10:00:00+00:00", "label": "Lun 1 Jun · 10:00", "start_time": "2026-06-01T10:00:00+00:00"}
        ]
        with (
            patch("f.internal.booking_prefetch.main._connect", AsyncMock(return_value=db)),
            patch(
                "f.internal.booking_prefetch.main._has_active_booking_for_provider",
                AsyncMock(return_value=False),
            ),
            patch(
                "f.internal.booking_prefetch.main._fetch_slots_for_doctor",
                AsyncMock(return_value=fake_slots),
            ),
        ):
            result = await _main_async(
                booking_state=state,
                booking_draft=None,
                pg_url=_PG_URL,
                user_input="1",
                client_id=_CLIENT_ID,
            )
        assert result["prefetch_type"] == "time_slots"
        assert result["resolved_doctor_id"] == _DOCTOR_ID
        assert len(cast("list[object]", result["items"])) == 1

    @pytest.mark.asyncio
    async def test_selecting_doctor_no_client_id_skips_active_booking_check(self) -> None:
        """When client_id is None, _has_active_booking_for_provider is NOT called."""
        state: dict[str, object] = {
            "name": "selecting_doctor",
            "items": [{"id": _DOCTOR_ID, "name": "Dr. Test"}],
        }
        db = _make_db()
        fake_slots: list[dict[str, object]] = []
        with (
            patch("f.internal.booking_prefetch.main._connect", AsyncMock(return_value=db)),
            patch(
                "f.internal.booking_prefetch.main._fetch_slots_for_doctor",
                AsyncMock(return_value=fake_slots),
            ),
            patch(
                "f.internal.booking_prefetch.main._has_active_booking_for_provider",
                AsyncMock(side_effect=AssertionError("should not be called")),
            ),
        ):
            result = await _main_async(
                booking_state=state,
                booking_draft=None,
                pg_url=_PG_URL,
                user_input="1",
                client_id=None,
            )
        assert result["prefetch_type"] == "time_slots"

    @pytest.mark.asyncio
    async def test_selecting_doctor_no_items_fetches_from_draft_specialty(self) -> None:
        state: dict[str, object] = {"name": "selecting_doctor", "items": []}
        draft: dict[str, object] = {"specialty_id": _SPECIALTY_ID}
        db = _make_db(fetch_return=_DOCTOR_ROWS)
        with patch("f.internal.booking_prefetch.main._connect", AsyncMock(return_value=db)):
            result = await _main_async(
                booking_state=state,
                booking_draft=draft,
                pg_url=_PG_URL,
                user_input=None,
            )
        assert result["prefetch_type"] == "doctors"
        assert len(cast("list[object]", result["items"])) == 1


# ── _main_async: selecting_time state ─────────────────────────────────────────


class TestPrefetchSelectingTimeState:
    @pytest.mark.asyncio
    async def test_selecting_time_no_items_retries_slot_fetch(self) -> None:
        state: dict[str, object] = {"name": "selecting_time", "items": [], "doctorId": _DOCTOR_ID}
        db = _make_db()
        fake_slots = [
            {"id": "2026-06-01T10:00:00+00:00", "label": "Lun 1 Jun · 10:00", "start_time": "2026-06-01T10:00:00+00:00"}
        ]
        with (
            patch("f.internal.booking_prefetch.main._connect", AsyncMock(return_value=db)),
            patch(
                "f.internal.booking_prefetch.main._fetch_slots_for_doctor",
                AsyncMock(return_value=fake_slots),
            ),
        ):
            result = await _main_async(
                booking_state=state,
                booking_draft=None,
                pg_url=_PG_URL,
            )
        assert result["prefetch_type"] == "time_slots"
        assert len(cast("list[object]", result["items"])) == 1

    @pytest.mark.asyncio
    async def test_selecting_time_with_existing_items_returns_no_match(self) -> None:
        # If state already has items, prefetch does nothing for selecting_time
        state: dict[str, object] = {
            "name": "selecting_time",
            "items": [{"id": "slot1", "label": "Lun 1 Jun · 10:00"}],
            "doctorId": _DOCTOR_ID,
        }
        db = _make_db()
        with patch("f.internal.booking_prefetch.main._connect", AsyncMock(return_value=db)):
            result = await _main_async(
                booking_state=state,
                booking_draft=None,
                pg_url=_PG_URL,
            )
        assert result["items"] == []
        assert result["prefetch_type"] is None


# ── _main_async: unknown state ─────────────────────────────────────────────────


class TestPrefetchUnknownState:
    @pytest.mark.asyncio
    async def test_unknown_state_returns_empty_no_match(self) -> None:
        db = _make_db()
        with patch("f.internal.booking_prefetch.main._connect", AsyncMock(return_value=db)):
            result = await _main_async(
                booking_state={"name": "confirming"},
                booking_draft=None,
                pg_url=_PG_URL,
            )
        assert result["items"] == []
        assert result["prefetch_type"] is None


# ── _main_async: error handling ────────────────────────────────────────────────


class TestPrefetchErrorHandling:
    @pytest.mark.asyncio
    async def test_db_connection_failure_raises_runtime_error(self) -> None:
        with (
            patch(
                "f.internal.booking_prefetch.main._connect",
                AsyncMock(side_effect=ConnectionError("DB unavailable")),
            ),
            pytest.raises(RuntimeError, match="Prefetch failed"),
        ):
            await _main_async(
                booking_state={"name": "idle"},
                booking_draft=None,
                pg_url=_PG_URL,
            )

    @pytest.mark.asyncio
    async def test_db_query_failure_raises_runtime_error(self) -> None:
        db = _make_db()
        db.fetch = AsyncMock(side_effect=Exception("query error"))
        with patch("f.internal.booking_prefetch.main._connect", AsyncMock(return_value=db)):
            with pytest.raises(RuntimeError, match="Prefetch failed"):
                await _main_async(
                    booking_state={"name": "idle"},
                    booking_draft=None,
                    pg_url=_PG_URL,
                )

    @pytest.mark.asyncio
    async def test_db_closed_on_error(self) -> None:
        db = _make_db()
        db.fetch = AsyncMock(side_effect=Exception("query error"))
        with patch("f.internal.booking_prefetch.main._connect", AsyncMock(return_value=db)):
            with pytest.raises(RuntimeError):
                await _main_async(
                    booking_state={"name": "idle"},
                    booking_draft=None,
                    pg_url=_PG_URL,
                )
        db.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_db_closed_on_success(self) -> None:
        db = _make_db(fetch_return=_SPECIALTY_ROWS)
        with patch("f.internal.booking_prefetch.main._connect", AsyncMock(return_value=db)):
            await _main_async(
                booking_state={"name": "idle"},
                booking_draft=None,
                pg_url=_PG_URL,
            )
        db.close.assert_called_once()
