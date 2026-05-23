"""Tests for _handle_smart_prefill — doctor search by name via AI entities.

SPEC: When user says "quiero hora con el dr gallegos", the AI extracts
provider_name="gallegos". The router calls _handle_smart_prefill which:
  - resolves provider via DB name match
  - if 1 match → direct to selecting_time with available slots
  - if multiple matches → shows doctor selection list
  - if no match → friendly error + main menu
  - if doctor has active booking → blocks and shows warning
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from f.internal.fsm_router._router_models import RouterInput
from f.internal.fsm_router.main import _handle_smart_prefill


def _make_input(**kwargs: Any) -> RouterInput:
    base: dict[str, Any] = {
        "chat_id": "chat-123",
        "user_input": "quiero hora con el dr gallegos",
        "state": {"booking_state": {"name": "idle"}, "booking_draft": {}},
        "pg_url": "postgresql://test:test@localhost/test",
        "client_id": "client-uuid-001",
        "phone": "+56999000000",
        "ai_entities": {"provider_name": "gallegos"},
        "ai_intent": "crear_cita",
        "ai_confidence": 0.95,
        "requires_fsm_routing": True,
    }
    base.update(kwargs)
    return RouterInput.model_validate(base)


_PROVIDER_ROW: dict[str, Any] = {
    "provider_id": "provider-uuid-001",
    "name": "Dr. Roger Gallegos",
    "specialty_id": "spec-uuid-001",
    "specialty_name": "Cardiología",
}

_SLOTS: list[dict[str, Any]] = [
    {"id": "slot-1", "label": "Lun 26 May · 10:00", "start_time": "2026-05-26T10:00:00Z"},
    {"id": "slot-2", "label": "Lun 26 May · 11:00", "start_time": "2026-05-26T11:00:00Z"},
]


class TestSmartPrefillSingleMatch:
    """Single doctor match → direct to selecting_time with slots."""

    @pytest.mark.asyncio
    @patch("f.internal.fsm_router.main._has_active_booking_for_provider", new_callable=AsyncMock)
    @patch("f.internal.fsm_router.main._fetch_slots_for_doctor", new_callable=AsyncMock)
    @patch("f.internal.fsm_router.main.resolve_provider_by_name", new_callable=AsyncMock)
    async def test_single_match_with_slots_goes_to_selecting_time(
        self,
        mock_resolve: AsyncMock,
        mock_slots: AsyncMock,
        mock_active: AsyncMock,
    ) -> None:
        # Arrange
        mock_resolve.return_value = [_PROVIDER_ROW]
        mock_active.return_value = False
        mock_slots.return_value = _SLOTS

        input_data = _make_input()

        # Act
        result = await _handle_smart_prefill(input_data, {})

        # Assert
        assert result.handled is True
        assert result.nextState is not None
        assert result.nextState["name"] == "selecting_time"
        assert result.nextState["doctorId"] == "provider-uuid-001"
        assert result.nextState["doctorName"] == "Dr. Roger Gallegos"
        assert isinstance(result.nextState["items"], list)
        assert len(result.nextState["items"]) == 2

    @pytest.mark.asyncio
    @patch("f.internal.fsm_router.main._has_active_booking_for_provider", new_callable=AsyncMock)
    @patch("f.internal.fsm_router.main._fetch_slots_for_doctor", new_callable=AsyncMock)
    @patch("f.internal.fsm_router.main.resolve_provider_by_name", new_callable=AsyncMock)
    async def test_single_match_no_slots_shows_no_availability(
        self,
        mock_resolve: AsyncMock,
        mock_slots: AsyncMock,
        mock_active: AsyncMock,
    ) -> None:
        # Arrange: doctor found but no slots available
        mock_resolve.return_value = [_PROVIDER_ROW]
        mock_active.return_value = False
        mock_slots.return_value = []

        input_data = _make_input()

        # Act
        result = await _handle_smart_prefill(input_data, {})

        # Assert: handled but no slots — shows informative message
        assert result.handled is True
        assert result.response_text is not None
        text = result.response_text.lower()
        assert "gallegos" in text or "dr" in text or "no" in text


class TestSmartPrefillMultipleMatches:
    """Multiple doctor matches → shows numbered menu with specialty per row."""

    @pytest.mark.asyncio
    @patch("f.internal.fsm_router.main.resolve_provider_by_name", new_callable=AsyncMock)
    async def test_multiple_matches_shows_numbered_specialty_menu(
        self,
        mock_resolve: AsyncMock,
    ) -> None:
        # Arrange: two doctors match "gallegos" from different specialties
        mock_resolve.return_value = [
            {
                **_PROVIDER_ROW,
                "provider_id": "p1",
                "name": "Dr. Jes\u00fas Gallegos",
                "specialty_name": "Cardiolog\u00eda",
            },
            {**_PROVIDER_ROW, "provider_id": "p2", "name": "Dr. Roger Gallegos", "specialty_name": "Neurolog\u00eda"},
        ]

        input_data = _make_input()

        # Act
        result = await _handle_smart_prefill(input_data, {})

        # Assert: selecting_doctor state with two items
        assert result.handled is True
        assert result.nextState is not None
        assert result.nextState["name"] == "selecting_doctor"
        items = result.nextState["items"]
        assert isinstance(items, list)
        assert len(items) == 2

        # Response is a numbered menu showing name + specialty (buttons replace number instruction)
        text = result.response_text or ""
        assert "1." in text
        assert "2." in text
        assert "Cardiología" in text
        assert "Neurología" in text
        # Inline buttons must be present — one per doctor + back/cancel
        assert result.inline_buttons is not None
        assert len(result.inline_buttons) >= 1


class TestSmartPrefillNoMatch:
    """No provider found → friendly message + idle."""

    @pytest.mark.asyncio
    @patch("f.internal.fsm_router.main.resolve_provider_by_name", new_callable=AsyncMock)
    async def test_no_match_returns_error_message(
        self,
        mock_resolve: AsyncMock,
    ) -> None:
        # Arrange
        mock_resolve.return_value = []

        input_data = _make_input(ai_entities={"provider_name": "Marchetti"})

        # Act
        result = await _handle_smart_prefill(input_data, {})

        # Assert: handled, idle state, shows not-found message
        assert result.handled is True
        assert result.nextState is not None
        assert result.nextState["name"] == "idle"
        assert result.response_text is not None
        assert "marchetti" in result.response_text.lower() or "no encontr" in result.response_text.lower()


class TestSmartPrefillActiveBookingBlock:
    """Client already has active booking with same doctor → blocked."""

    @pytest.mark.asyncio
    @patch("f.internal.fsm_router.main._has_active_booking_for_provider", new_callable=AsyncMock)
    @patch("f.internal.fsm_router.main.resolve_provider_by_name", new_callable=AsyncMock)
    async def test_active_booking_blocks_new_reservation(
        self,
        mock_resolve: AsyncMock,
        mock_active: AsyncMock,
    ) -> None:
        # Arrange: provider found but client has active booking
        mock_resolve.return_value = [_PROVIDER_ROW]
        mock_active.return_value = True

        input_data = _make_input()

        # Act
        result = await _handle_smart_prefill(input_data, {})

        # Assert: blocked with warning message, returns to idle
        assert result.handled is True
        assert result.nextState is not None
        assert result.nextState["name"] == "idle"
        assert result.response_text is not None
        assert "cita" in result.response_text.lower() or "agendada" in result.response_text.lower()


class TestSmartPrefillNoPgUrl:
    """Missing pg_url → not handled (pass-through)."""

    @pytest.mark.asyncio
    async def test_no_pg_url_returns_not_handled(self) -> None:
        # Arrange: no pg_url
        input_data = RouterInput.model_validate(
            {
                "chat_id": "chat-123",
                "user_input": "quiero hora con el dr gallegos",
                "state": {},
                "ai_entities": {"provider_name": "gallegos"},
            }
        )

        # Act
        result = await _handle_smart_prefill(input_data, {})

        # Assert: not handled (no DB available)
        assert result.handled is False


class TestSmartPrefillNoProviderName:
    """Missing provider_name entity → not handled."""

    @pytest.mark.asyncio
    async def test_no_provider_name_returns_not_handled(self) -> None:
        # Arrange: no provider_name in entities
        input_data = _make_input(ai_entities={"date": "martes"})

        # Act
        result = await _handle_smart_prefill(input_data, {})

        # Assert
        assert result.handled is False
