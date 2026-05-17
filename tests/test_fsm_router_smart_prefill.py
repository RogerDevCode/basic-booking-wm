from __future__ import annotations

from typing import Any, cast
from unittest.mock import AsyncMock, patch

import pytest

from f.internal.fsm_router.main import _main_async

# ============================================================================
# Smart Pre-fill: Happy Path — single provider match, skip to selecting_time
# ============================================================================


@pytest.mark.asyncio
async def test_smart_prefill_single_provider_skips_to_selecting_time() -> None:
    """Usuario menciona doctor específico → salta specialty+doctor → selecting_time."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "user_input": "quiero hora para mañana con el Dr. Gallegos",
        "state": {
            "booking_state": {"name": "idle"},
            "booking_draft": {},
        },
        "requires_fsm_routing": True,
        "ai_intent": "crear_cita",
        "ai_confidence": 0.9,
        "ai_entities": {"provider_name": "Dr. Gallegos", "date": "mañana"},
        "phone": "+56912345678",
        "pg_url": "postgresql://test",
    }

    with (
        patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()),
        patch(
            "f.internal.fsm_router.main.resolve_provider_by_name",
            AsyncMock(
                return_value=[
                    {
                        "provider_id": "uuid-gallegos",
                        "name": "Dr. Gallegos",
                        "specialty_id": "spec-cardio",
                        "specialty_name": "Cardiología",
                    }
                ]
            ),
        ),
        patch(
            "f.internal.fsm_router.main._has_active_booking_for_provider",
            AsyncMock(return_value=False),
        ),
        patch(
            "f.internal.fsm_router.main._fetch_slots_for_doctor",
            AsyncMock(
                return_value=[
                    {
                        "id": "2026-05-18T09:00:00Z",
                        "label": "Lun 18 May · 09:00",
                        "start_time": "2026-05-18T09:00:00Z",
                    }
                ]
            ),
        ),
    ):
        res = await _main_async(args)

    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is True
    assert data["nextState"]["name"] == "selecting_time"
    assert data["nextState"]["doctorId"] == "uuid-gallegos"
    assert data["nextState"]["doctorName"] == "Dr. Gallegos"
    assert "Gallegos" in data["response_text"]
    assert len(data["nextState"]["items"]) == 1


# ============================================================================
# Smart Pre-fill: Ambiguous — multiple providers match
# ============================================================================


@pytest.mark.asyncio
async def test_smart_prefill_ambiguous_shows_list() -> None:
    """Nombre ambiguo → muestra lista para elegir."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "user_input": "quiero hora con Pérez",
        "state": {
            "booking_state": {"name": "idle"},
            "booking_draft": {},
        },
        "requires_fsm_routing": True,
        "ai_intent": "crear_cita",
        "ai_confidence": 0.9,
        "ai_entities": {"provider_name": "Pérez"},
        "phone": "+56912345678",
        "pg_url": "postgresql://test",
    }

    with (
        patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()),
        patch(
            "f.internal.fsm_router.main.resolve_provider_by_name",
            AsyncMock(
                return_value=[
                    {
                        "provider_id": "uuid-juan",
                        "name": "Dr. Juan Pérez",
                        "specialty_id": "spec-cardio",
                        "specialty_name": "Cardiología",
                    },
                    {
                        "provider_id": "uuid-ana",
                        "name": "Dra. Ana Pérez",
                        "specialty_id": "spec-derma",
                        "specialty_name": "Dermatología",
                    },
                ]
            ),
        ),
    ):
        res = await _main_async(args)

    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is True
    assert data["nextState"]["name"] == "selecting_doctor"
    assert len(data["nextState"]["items"]) == 2
    assert "Juan Pérez" in data["response_text"]
    assert "Ana Pérez" in data["response_text"]


# ============================================================================
# Smart Pre-fill: No match — fallback to normal flow
# ============================================================================


@pytest.mark.asyncio
async def test_smart_prefill_no_match_returns_informative_message() -> None:
    """Doctor no encontrado → handled=True con mensaje informativo, estado idle."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "user_input": "quiero hora con el Dr. Inexistente",
        "state": {
            "booking_state": {"name": "idle"},
            "booking_draft": {},
        },
        "requires_fsm_routing": True,
        "ai_intent": "crear_cita",
        "ai_confidence": 0.9,
        "ai_entities": {"provider_name": "Dr. Inexistente"},
        "phone": "+56912345678",
        "pg_url": "postgresql://test",
    }

    with (
        patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()),
        patch(
            "f.internal.fsm_router.main.resolve_provider_by_name",
            AsyncMock(return_value=[]),
        ),
    ):
        res = await _main_async(args)

    data = cast("dict[str, Any]", res["data"])
    # Must be handled=True so flow doesn't fall through to "no entendí tu mensaje"
    assert data["handled"] is True
    assert data["nextState"]["name"] == "idle"
    # Inform user the doctor wasn't found
    assert "No encontré" in data["response_text"] or "no encontr" in data["response_text"].lower()


# ============================================================================
# Smart Pre-fill: Already booked — block
# ============================================================================


@pytest.mark.asyncio
async def test_smart_prefill_already_booked_blocks() -> None:
    """Cliente ya tiene cita con ese doctor → bloquea."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "user_input": "quiero otra hora con el Dr. Gallegos",
        "state": {
            "booking_state": {"name": "idle"},
            "booking_draft": {},
        },
        "requires_fsm_routing": True,
        "ai_intent": "crear_cita",
        "ai_confidence": 0.9,
        "ai_entities": {"provider_name": "Dr. Gallegos"},
        "phone": "+56912345678",
        "client_id": "client-001",
        "pg_url": "postgresql://test",
    }

    with (
        patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()),
        patch(
            "f.internal.fsm_router.main.resolve_provider_by_name",
            AsyncMock(
                return_value=[
                    {
                        "provider_id": "uuid-gallegos",
                        "name": "Dr. Gallegos",
                        "specialty_id": "spec-cardio",
                        "specialty_name": "Cardiología",
                    }
                ]
            ),
        ),
        patch(
            "f.internal.fsm_router.main._has_active_booking_for_provider",
            AsyncMock(return_value=True),
        ),
    ):
        res = await _main_async(args)

    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is True
    assert data["nextState"]["name"] == "idle"
    assert "Ya tienes una cita" in data["response_text"]


# ============================================================================
# Smart Pre-fill: No slots — message + fallback
# ============================================================================


@pytest.mark.asyncio
async def test_smart_prefill_no_slots_shows_message() -> None:
    """Doctor encontrado pero sin horarios → mensaje amigable."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "user_input": "quiero hora con el Dr. Gallegos",
        "state": {
            "booking_state": {"name": "idle"},
            "booking_draft": {},
        },
        "requires_fsm_routing": True,
        "ai_intent": "crear_cita",
        "ai_confidence": 0.9,
        "ai_entities": {"provider_name": "Dr. Gallegos"},
        "phone": "+56912345678",
        "pg_url": "postgresql://test",
    }

    with (
        patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()),
        patch(
            "f.internal.fsm_router.main.resolve_provider_by_name",
            AsyncMock(
                return_value=[
                    {
                        "provider_id": "uuid-gallegos",
                        "name": "Dr. Gallegos",
                        "specialty_id": "spec-cardio",
                        "specialty_name": "Cardiología",
                    }
                ]
            ),
        ),
        patch(
            "f.internal.fsm_router.main._has_active_booking_for_provider",
            AsyncMock(return_value=False),
        ),
        patch(
            "f.internal.fsm_router.main._fetch_slots_for_doctor",
            AsyncMock(return_value=[]),
        ),
    ):
        res = await _main_async(args)

    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is True
    assert data["nextState"]["name"] == "selecting_specialty"
    assert "no tiene horarios" in data["response_text"].lower()


# ============================================================================
# Smart Pre-fill: No entities — normal flow (not smart pre-fill)
# ============================================================================


@pytest.mark.asyncio
async def test_smart_prefill_no_entities_uses_normal_flow() -> None:
    """Sin entities de provider → flujo normal de selecting_specialty."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "user_input": "quiero agendar una hora",
        "state": {
            "booking_state": {"name": "idle"},
            "booking_draft": {},
        },
        "requires_fsm_routing": True,
        "ai_intent": "crear_cita",
        "ai_confidence": 0.9,
        "ai_entities": {},
        "phone": "+56912345678",
        "pg_url": "postgresql://test",
    }

    with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
        res = await _main_async(args)

    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is True
    assert data["nextState"]["name"] == "selecting_specialty"
