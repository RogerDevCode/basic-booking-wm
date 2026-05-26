from __future__ import annotations

from typing import Any, cast
from unittest.mock import AsyncMock, patch

import pytest

from f.internal.fsm_router.main import _main_async as fsm_router_main
from f.nlu._tfidf_classifier import classify_intent

# ============================================================================
# NLU — Natural Language Intent Classification
# Tests the TF-IDF classifier with realistic Chilean Spanish messages.
# ============================================================================


class TestNLU_SolicitarHoras:
    """Happy path: user wants to book an appointment."""

    @pytest.mark.parametrize(
        "message",
        [
            "quiero agendar una hora para mañana",
            "necesito hora con el doctor el lunes",
            "quiero una hora para el viernes a las diez",
            "reservar turno con especialista",
            "agendar consulta medica urgente",
            "necesito hora urgente",
            "solicitar hora para control",
            "quiero una hora",
            "quiero de inmediato una hora",
            "necesito agendar una hora lo antes posible",
            "quiero hacer una hora para esta semana",
            "puedo hacer una hora para el jueves",
            "quiero agendar una cita para mañana",
            "necesito cita urgente",
            "quiero hacer una cita para esta semana",
        ],
    )
    def test_crearcita_detected(self, message: str) -> None:
        result = classify_intent(message)
        assert result["intent"] == "crear_cita", f"Failed for: {message}"
        assert result["confidence"] >= 0.4, f"Low confidence for: {message}"

    @pytest.mark.parametrize(
        "message",
        [
            "pedir hora medica",
            "tomar hora con el doctor",
            "sacar hora para cardiologia",
        ],
    )
    def test_crearcita_requires_preprocessor(self, message: str) -> None:
        """Chilean modisms need message preprocessor before TF-IDF classification."""
        result = classify_intent(message)
        assert result["intent"] != "crear_cita", f"Should not match without preprocessor: {message}"


class TestNLU_CancelarHoras:
    """Happy path: user wants to cancel an appointment."""

    @pytest.mark.parametrize(
        "message",
        [
            "quiero cancelar mi hora del martes",
            "no podre ir cancélame la hora",
            "anular turno programado para mañana",
            "eliminar hora agendada",
            "borrar mi reserva del jueves",
            "no podre ir cancélame",
            "cancelar hora que tengo",
            "necesito cancelar mi hora de mañana",
            "cancelar hora del lunes por favor",
            "necesito cancelar mi hora",
            "quiero cancelar mi hora",
            "cancela mi hora",
            "quiero anular mi hora",
            "quiero cancelar mi cita del martes",
            "necesito cancelar mi cita",
            "cancelar cita que tengo",
        ],
    )
    def test_cancelarcita_detected(self, message: str) -> None:
        result = classify_intent(message)
        assert result["intent"] == "cancelar_cita", f"Failed for: {message}"
        assert result["confidence"] >= 0.4, f"Low confidence for: {message}"


class TestNLU_ReagendarHoras:
    """Happy path: user wants to reschedule an appointment."""

    @pytest.mark.parametrize(
        "message",
        [
            "necesito cambiar mi cita del viernes al jueves",
            "reprogramar turno para la otra semana",
            "mejor para el miércoles a las once",
            "mover mi hora de mañana para pasado",
            "quiero cambiar la cita para otro dia",
            "reagendar cita para la próxima semana",
            "cambiar cita para el lunes",
            "necesito reagendar mi consulta",
        ],
    )
    def test_reagendarcita_detected(self, message: str) -> None:
        result = classify_intent(message)
        assert result["intent"] == "reagendar_cita", f"Failed for: {message}"
        assert result["confidence"] >= 0.4, f"Low confidence for: {message}"


class TestNLU_VerMisHoras:
    """Happy path: user wants to see their appointments."""

    @pytest.mark.parametrize(
        "message",
        [
            "tengo alguna hora agendada",
            "cuando es mi hora",
            "mis horas próximas",
            "confirmame el turno que reserve",
            "quiero saber si tengo hora",
            "tengo hora para mañana",
            "revisar mis reservas",
            "ver mis horas",
            "que horas tengo",
            "mis citas próximas",
            "tengo alguna cita agendada",
            "ver mis citas",
        ],
    )
    def test_vermiscitas_detected(self, message: str) -> None:
        result = classify_intent(message)
        assert result["intent"] == "ver_mis_citas", f"Failed for: {message}"
        assert result["confidence"] >= 0.4, f"Low confidence for: {message}"


# ============================================================================
# FSM Router — Natural Language Happy Path Integration
# Simulates full user conversations with the FSM router.
# ============================================================================


class TestFSMRouter_SolicitarHora:
    """Happy path: user requests appointment with natural language."""

    @pytest.mark.asyncio
    async def test_simple_request_from_idle(self) -> None:
        """User says 'quiero agendar una hora' from idle state."""
        args: dict[str, Any] = {
            "chat_id": "123",
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
        }

        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await fsm_router_main(args)

        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "selecting_specialty"

    @pytest.mark.asyncio
    async def test_request_with_provider_name(self) -> None:
        """User says 'quiero hora con el Dr. Gallegos' — smart pre-fill."""
        args: dict[str, Any] = {
            "chat_id": "123",
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
            res = await fsm_router_main(args)

        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "selecting_time"
        assert data["nextState"]["doctorId"] == "uuid-gallegos"
        assert "Gallegos" in data["response_text"]

    @pytest.mark.asyncio
    async def test_request_with_time_preference(self) -> None:
        """User says 'quiero hora mañana en la mañana' — time context."""
        args: dict[str, Any] = {
            "chat_id": "123",
            "user_input": "quiero hora mañana en la mañana",
            "state": {
                "booking_state": {"name": "idle"},
                "booking_draft": {},
            },
            "requires_fsm_routing": True,
            "ai_intent": "crear_cita",
            "ai_confidence": 0.9,
            "ai_entities": {"date": "mañana"},
            "client_id": "client-123",
            "phone": "+56912345678",
        }

        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await fsm_router_main(args)

        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "selecting_specialty"


class TestFSMRouter_CancelarHora:
    """Happy path: user cancels appointment with natural language."""

    @pytest.mark.asyncio
    async def test_cancel_from_idle(self) -> None:
        """User says 'quiero cancelar mi hora' from idle state."""
        args: dict[str, Any] = {
            "chat_id": "123",
            "user_input": "quiero cancelar mi hora del martes",
            "state": {
                "booking_state": {"name": "idle"},
                "booking_draft": {},
            },
            "requires_fsm_routing": True,
            "ai_intent": "cancelar_cita",
            "ai_confidence": 0.9,
            "ai_entities": {},
            "client_id": "client-001",
            "pg_url": "postgresql://test",
        }

        with (
            patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()),
            patch(
                "f.internal.fsm_router.handlers._wallet_handler.get_mis_citas_data",
                AsyncMock(
                    return_value=(
                        "📋 *Mis Horas* (1 próxima)\n\n"
                        "✅ Confirmada\n"
                        "👨‍⚕️ Dr. Gallegos — Cardiología\n"
                        "📅 20 de mayo a las 10:00\n"
                        "🆔 Ref: `GA-123-456`",
                        None,
                    )
                ),
            ),
        ):
            res = await fsm_router_main(args)

        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert "Mis Horas" in data["response_text"]


class TestFSMRouter_ReagendarHora:
    """Happy path: user reschedules appointment with natural language."""

    @pytest.mark.asyncio
    async def test_reschedule_from_idle(self) -> None:
        """User says 'quiero cambiar mi hora' from idle state."""
        args: dict[str, Any] = {
            "chat_id": "123",
            "user_input": "necesito cambiar mi cita del viernes al jueves",
            "state": {
                "booking_state": {"name": "idle"},
                "booking_draft": {},
            },
            "requires_fsm_routing": True,
            "ai_intent": "reagendar_cita",
            "ai_confidence": 0.9,
            "ai_entities": {},
            "client_id": "client-001",
            "pg_url": "postgresql://test",
        }

        with (
            patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()),
            patch(
                "f.internal.fsm_router.handlers._wallet_handler.get_mis_citas_data",
                AsyncMock(
                    return_value=(
                        "📋 *Mis Horas* (1 próxima)\n\n"
                        "✅ Confirmada\n"
                        "👨‍⚕️ Dr. Gallegos — Cardiología\n"
                        "📅 20 de mayo a las 10:00\n"
                        "🆔 Ref: `GA-123-456`",
                        None,
                    )
                ),
            ),
        ):
            res = await fsm_router_main(args)

        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert "Mis Horas" in data["response_text"]


class TestFSMRouter_VerMisHoras:
    """Happy path: user checks their appointments with natural language."""

    @pytest.mark.asyncio
    async def test_ver_mis_horas_from_idle(self) -> None:
        """User says 'quiero ver mis horas' from idle state."""
        args: dict[str, Any] = {
            "chat_id": "123",
            "user_input": "quiero ver mis horas",
            "state": {
                "booking_state": {"name": "idle"},
                "booking_draft": {},
            },
            "requires_fsm_routing": True,
            "ai_intent": "ver_mis_citas",
            "ai_confidence": 0.9,
            "ai_entities": {},
            "client_id": "client-001",
            "pg_url": "postgresql://test",
        }

        with (
            patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()),
            patch(
                "f.internal.fsm_router.handlers._wallet_handler.get_mis_citas_data",
                AsyncMock(
                    return_value=(
                        "📋 *Mis Horas* (1 próxima)\n\n"
                        "✅ Confirmada\n"
                        "👨‍⚕️ Dr. Gallegos — Cardiología\n"
                        "📅 20 de mayo a las 10:00\n"
                        "🆔 Ref: `GA-123-456`",
                        None,
                    )
                ),
            ),
        ):
            res = await fsm_router_main(args)

        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert "Mis Horas" in data["response_text"]
        assert "Dr. Gallegos" in data["response_text"]
        assert "Cardiología" in data["response_text"]
