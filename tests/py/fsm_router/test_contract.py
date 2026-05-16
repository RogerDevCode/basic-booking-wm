from __future__ import annotations

from typing import Any, cast
from unittest.mock import AsyncMock, patch

import pytest

from f.internal.fsm_router.main import _main_async


@pytest.mark.asyncio
async def test_fsm_router_ignores_non_booking_in_idle() -> None:
    """INVARIANTE: sin requires_fsm_routing → handled=False."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "user_input": "hola",
        "state": {"booking_state": {"name": "idle"}},
        "requires_fsm_routing": False,
    }
    res = await _main_async(args)
    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is False


@pytest.mark.asyncio
async def test_fsm_router_handles_start_command() -> None:
    """INVARIANTE: /start siempre responde con menú."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "user_input": "/start",
        "state": {"booking_state": {"name": "idle"}},
        "requires_fsm_routing": True,
    }
    res = await _main_async(args)
    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is True
    assert data["nextState"]["name"] == "idle"
    assert "Hola" in data["response_text"]


@pytest.mark.asyncio
async def test_fsm_router_crearcita_from_idle_starts_registration() -> None:
    """Booking intent desde idle sin registro → inicia registro."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "user_input": "quiero agendar",
        "state": {
            "booking_state": {"name": "idle"},
            "booking_draft": {},
        },
        "requires_fsm_routing": True,
        "ai_intent": "crear_cita",
        "ai_confidence": 0.95,
        "phone": None,
    }
    res = await _main_async(args)
    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is True
    assert data["nextState"]["name"] == "needs_registration"


@pytest.mark.asyncio
async def test_fsm_router_crearcita_from_idle_with_phone() -> None:
    """Booking intent desde idle con registro → avanza a selecting_specialty."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "user_input": "quiero agendar",
        "state": {
            "booking_state": {"name": "idle"},
            "booking_draft": {},
        },
        "requires_fsm_routing": True,
        "ai_intent": "crear_cita",
        "ai_confidence": 0.95,
        "phone": "+56912345678",
    }
    with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
        res = await _main_async(args)
    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is True
    assert data["nextState"]["name"] == "selecting_specialty"


@pytest.mark.asyncio
async def test_fsm_router_mis_citas_from_idle() -> None:
    """Mis citas desde idle → handled=True."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "user_input": "ver mis citas",
        "state": {
            "booking_state": {"name": "idle"},
            "booking_draft": {},
        },
        "requires_fsm_routing": True,
        "ai_intent": "mis_citas",
        "ai_confidence": 0.9,
        "client_id": "test-client-id",
        "pg_url": "postgresql://test",
    }
    with (
        patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()),
        patch(
            "f.internal.fsm_router.main.get_mis_citas_text", AsyncMock(return_value="📋 *Mis Horas*\n\nTus citas...")
        ),
    ):
        res = await _main_async(args)
    data = cast("dict[str, Any]", res["data"])
    assert data["handled"] is True
    assert "Mis Horas" in data["response_text"]
