from __future__ import annotations

from typing import Any, cast
from unittest.mock import AsyncMock, patch

import pytest

from f.internal._config import DEFAULT_TIMEZONE
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
        "client_id": "client-123",
        "phone": "+56912345678",
        "pg_url": "postgresql://test",
    }

    mock_db = AsyncMock()
    mock_db.fetchrow.return_value = {"tz_name": DEFAULT_TIMEZONE}

    with (
        patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()),
        patch(
            "f.internal.fsm_router.handlers._smart_prefill_handler.resolve_provider_by_name",
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
            "f.internal.fsm_router.handlers._smart_prefill_handler._has_active_booking_for_provider",
            AsyncMock(return_value=False),
        ),
        patch(
            "f.internal.fsm_router.handlers._smart_prefill_handler._create_db_client",
            AsyncMock(return_value=mock_db),
        ),
        patch(
            "f.internal.fsm_router.handlers._smart_prefill_handler._fetch_slots_for_doctor",
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


# ============================================================================
# Smart Pre-fill: Date Filtering — resolve "viernes", "mañana", etc.
# ============================================================================


@pytest.mark.asyncio
async def test_smart_prefill_with_date_entity_resolves_target_date() -> None:
    """Usuario dice 'quiero hora para el viernes' → resuelve fecha y filtra slots."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "user_input": "quiero hora para el viernes con el Dr. Gallegos",
        "state": {
            "booking_state": {"name": "idle"},
            "booking_draft": {},
        },
        "requires_fsm_routing": True,
        "ai_intent": "crear_cita",
        "ai_confidence": 0.9,
        "ai_entities": {"provider_name": "Dr. Gallegos", "date": "viernes"},
        "client_id": "client-123",
        "phone": "+56912345678",
        "pg_url": "postgresql://test",
    }

    mock_db = AsyncMock()
    mock_db.fetchrow.return_value = {"tz_name": DEFAULT_TIMEZONE}

    with (
        patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()),
        patch(
            "f.internal.fsm_router.handlers._smart_prefill_handler.resolve_provider_by_name",
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
            "f.internal.fsm_router.handlers._smart_prefill_handler._has_active_booking_for_provider",
            AsyncMock(return_value=False),
        ),
        patch(
            "f.internal.fsm_router.handlers._smart_prefill_handler._create_db_client",
            AsyncMock(return_value=mock_db),
        ),
        patch(
            "f.internal.fsm_router.handlers._smart_prefill_handler._fetch_slots_for_doctor", AsyncMock(return_value=[])
        ) as mock_fetch,
    ):
        await _main_async(args)

    # Verify _fetch_slots_for_doctor was called with target_date
    mock_fetch.assert_called_once()
    call_kwargs = mock_fetch.call_args
    # The call is (pg_url, provider_id, target_date)
    assert call_kwargs[0][0] == "postgresql://test"
    assert call_kwargs[0][1] == "uuid-gallegos"
    # target_date should be a valid YYYY-MM-DD string (not None)
    target_date = call_kwargs[0][2]
    assert target_date is not None
    assert len(target_date) == 10  # YYYY-MM-DD format


@pytest.mark.asyncio
async def test_smart_prefill_with_date_shows_date_in_response() -> None:
    """Usuario dice 'quiero hora para mañana' → respuesta menciona la fecha."""
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
        "client_id": "client-123",
        "phone": "+56912345678",
        "pg_url": "postgresql://test",
    }

    mock_db = AsyncMock()
    mock_db.fetchrow.return_value = {"tz_name": DEFAULT_TIMEZONE}

    with (
        patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()),
        patch(
            "f.internal.fsm_router.handlers._smart_prefill_handler.resolve_provider_by_name",
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
            "f.internal.fsm_router.handlers._smart_prefill_handler._has_active_booking_for_provider",
            AsyncMock(return_value=False),
        ),
        patch(
            "f.internal.fsm_router.handlers._smart_prefill_handler._create_db_client",
            AsyncMock(return_value=mock_db),
        ),
        patch(
            "f.internal.fsm_router.handlers._smart_prefill_handler._fetch_slots_for_doctor",
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
    # Response should mention the date
    assert "para el" in data["response_text"]


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
        "client_id": "client-123",
        "phone": "+56912345678",
        "pg_url": "postgresql://test",
    }

    with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
        res = await _main_async(args)

    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is True
    assert data["nextState"]["name"] == "selecting_specialty"


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
        "client_id": "client-123",
        "phone": "+56912345678",
        "pg_url": "postgresql://test",
    }

    with (
        patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()),
        patch(
            "f.internal.fsm_router.handlers._smart_prefill_handler.resolve_provider_by_name",
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
    assert any("Juan Pérez" in btn["text"] for row in data["inline_buttons"] for btn in row)
    assert any("Ana Pérez" in btn["text"] for row in data["inline_buttons"] for btn in row)


# ============================================================================
# Smart Pre-fill: No match — fallback to normal flow
# ============================================================================


@pytest.mark.asyncio
async def test_smart_prefill_no_match_returns_informative_message() -> None:
    """Doctor no encontrado → mensaje informativo."""
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
        "client_id": "client-123",
        "phone": "+56912345678",
        "pg_url": "postgresql://test",
    }

    with (
        patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()),
        patch(
            "f.internal.fsm_router.handlers._smart_prefill_handler.resolve_provider_by_name",
            AsyncMock(return_value=[]),
        ),
    ):
        res = await _main_async(args)

    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is True
    assert data["nextState"]["name"] == "idle"
    assert "no encontré" in data["response_text"].lower()


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
        "client_id": "client-001",
        "phone": "+56912345678",
        "pg_url": "postgresql://test",
    }

    with (
        patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()),
        patch(
            "f.internal.fsm_router.handlers._smart_prefill_handler.resolve_provider_by_name",
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
            "f.internal.fsm_router.handlers._smart_prefill_handler._fetch_slots_for_doctor",
            AsyncMock(return_value=[{"id": "slot-1", "label": "10:00", "start_time": "2026-05-28T10:00:00-04:00"}]),
        ),
    ):
        res = await _main_async(args)

    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is True
    assert data["nextState"]["name"] == "selecting_time"


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
        "client_id": "client-123",
        "phone": "+56912345678",
        "pg_url": "postgresql://test",
    }

    mock_db = AsyncMock()
    mock_db.fetchrow.return_value = {"tz_name": DEFAULT_TIMEZONE}

    with (
        patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()),
        patch(
            "f.internal.fsm_router.handlers._smart_prefill_handler.resolve_provider_by_name",
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
            "f.internal.fsm_router.handlers._smart_prefill_handler._has_active_booking_for_provider",
            AsyncMock(return_value=False),
        ),
        patch(
            "f.internal.fsm_router.handlers._smart_prefill_handler._create_db_client",
            AsyncMock(return_value=mock_db),
        ),
        patch(
            "f.internal.fsm_router.handlers._smart_prefill_handler._fetch_slots_for_doctor",
            AsyncMock(return_value=[]),
        ),
    ):
        res = await _main_async(args)

    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is True
    assert data["nextState"]["name"] == "selecting_specialty"
    assert "no tiene horarios" in data["response_text"].lower()
