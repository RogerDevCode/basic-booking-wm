from __future__ import annotations

from typing import Any, ClassVar, cast
from unittest.mock import AsyncMock, patch

import pytest

from f.internal.booking_fsm._fsm_machine import apply_transition, parse_action
from f.internal.booking_fsm._fsm_models import (
    BackAction,
    CancelAction,
    ConfirmingState,
    ConfirmNoAction,
    ConfirmYesAction,
    DraftBooking,
    DraftCore,
    NamedItem,
    SelectAction,
    SelectDateAction,
    SelectingDoctorState,
    SelectingSpecialtyState,
    SelectingTimeState,
    TimeSlotItem,
)
from f.internal.fsm_router.main import _main_async

# ============================================================================
# TEST FIXTURES — Shared data for combinatorial tests
# ============================================================================

_SPECIALTIES: list[NamedItem] = [
    {"id": "spec-cardio", "name": "Cardiología"},
    {"id": "spec-derma", "name": "Dermatología"},
    {"id": "spec-neuro", "name": "Neurología"},
]

_DOCTORS_CARDIO: list[NamedItem] = [
    {"id": "doc-gallegos", "name": "Dr. Gallegos"},
    {"id": "doc-valenzuela", "name": "Dr. Valenzuela"},
]

_DOCTORS_DERMA: list[NamedItem] = [
    {"id": "doc-munoz", "name": "Dra. Muñoz"},
]

_SLOTS: list[TimeSlotItem] = [
    {"id": "slot-1", "label": "Lun 18 May · 09:00", "start_time": "2026-05-18T09:00:00Z"},
    {"id": "slot-2", "label": "Lun 18 May · 10:00", "start_time": "2026-05-18T10:00:00Z"},
    {"id": "slot-3", "label": "Mar 19 May · 11:00", "start_time": "2026-05-19T11:00:00Z"},
]

_EMPTY_DRAFT = DraftBooking()

_BASE_ARGS: dict[str, Any] = {
    "chat_id": "test-chat-1",
    "user_input": "",
    "state": {"booking_state": {"name": "idle"}, "booking_draft": {}},
    "items": [],
    "requires_fsm_routing": True,
    "ai_intent": None,
    "ai_confidence": 0.0,
    "ai_entities": {},
    "client_id": "client-123",
    "phone": "+56912345678",
    "client_name": "Test User",
    "pg_url": "postgresql://test",
}


def _args(**overrides: Any) -> dict[str, Any]:
    base = {
        "chat_id": "test-chat-1",
        "user_input": "",
        "state": {"booking_state": {"name": "idle"}, "booking_draft": {}},
        "items": [],
        "requires_fsm_routing": True,
        "ai_intent": None,
        "ai_confidence": 0.0,
        "ai_entities": {},
        "client_id": "client-123",
        "phone": "+56912345678",
        "client_name": "Test User",
        "pg_url": "postgresql://test",
    }
    base.update(overrides)
    return base


# ============================================================================
# LEVEL 1: MENÚ PRINCIPAL — Idle state transitions
# ============================================================================


class TestLevel1MenuPrincipal:
    """Test all Level 1 menu entries from idle state."""

    # --- 1. Agendar hora ---

    @pytest.mark.asyncio
    async def test_idle_agendar_keyword_1_enters_selecting_specialty(self) -> None:
        """Tecla '1' desde idle → selecting_specialty."""
        args = _args(user_input="1", items=_SPECIALTIES, ai_intent="crear_cita", ai_confidence=0.95)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "selecting_specialty"

    @pytest.mark.asyncio
    async def test_idle_agendar_keyword_agendar_enters_selecting_specialty(self) -> None:
        """Palabra 'agendar' desde idle → selecting_specialty."""
        args = _args(user_input="quiero agendar", ai_intent="crear_cita", ai_confidence=0.95, items=_SPECIALTIES)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "selecting_specialty"

    @pytest.mark.asyncio
    async def test_idle_agendar_keyword_nueva_hora_enters_selecting_specialty(self) -> None:
        """Palabra 'nueva hora' desde idle → selecting_specialty."""
        args = _args(user_input="nueva hora", ai_intent="crear_cita", ai_confidence=0.9, items=_SPECIALTIES)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "selecting_specialty"

    @pytest.mark.asyncio
    async def test_idle_agendar_keyword_pedir_hora_enters_selecting_specialty(self) -> None:
        """Palabra 'pedir hora' desde idle → selecting_specialty."""
        args = _args(user_input="pedir hora", ai_intent="crear_cita", ai_confidence=0.9, items=_SPECIALTIES)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "selecting_specialty"

    # --- 2. Mis horas ---

    @pytest.mark.asyncio
    async def test_idle_mis_horas_keyword_2_shows_bookings(self) -> None:
        """Tecla '2' desde idle → muestra mis horas."""
        args = _args(user_input="2", ai_intent="ver_mis_citas", ai_confidence=0.95)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "idle"

    @pytest.mark.asyncio
    async def test_idle_mis_horas_keyword_ver_mis_citas_shows_bookings(self) -> None:
        """'ver mis citas' desde idle → muestra mis horas."""
        args = _args(user_input="ver mis citas", ai_intent="ver_mis_citas", ai_confidence=0.95)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "idle"

    @pytest.mark.asyncio
    async def test_idle_mis_horas_keyword_mis_horas_shows_bookings(self) -> None:
        """'mis horas' desde idle → muestra mis horas."""
        args = _args(user_input="mis horas", ai_intent="ver_mis_citas", ai_confidence=0.95)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "idle"

    # --- 3. Recordatorios ---

    @pytest.mark.asyncio
    async def test_idle_recordatorios_keyword_3_not_handled_by_fsm(self) -> None:
        """Tecla '3' desde idle → not handled by FSM (delegated to conversational router)."""
        args = _args(user_input="3", ai_intent="activar_recordatorios", ai_confidence=0.95)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is False

    @pytest.mark.asyncio
    async def test_idle_recordatorios_keyword_recordatorios_not_handled_by_fsm(self) -> None:
        """'recordatorios' desde idle → not handled by FSM (delegated to conversational router)."""
        args = _args(user_input="recordatorios", ai_intent="activar_recordatorios", ai_confidence=0.95)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is False

    # --- 4. Información ---

    @pytest.mark.asyncio
    async def test_idle_informacion_keyword_4_not_handled_by_fsm(self) -> None:
        """Tecla '4' desde idle → not handled by FSM (delegated to conversational router)."""
        args = _args(user_input="4", ai_intent="pregunta_general", ai_confidence=0.95)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is False

    @pytest.mark.asyncio
    async def test_idle_informacion_keyword_info_not_handled_by_fsm(self) -> None:
        """'info' desde idle → not handled by FSM (delegated to conversational router)."""
        args = _args(user_input="info", ai_intent="pregunta_general", ai_confidence=0.95)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is False

    # --- 5. Mis datos ---

    @pytest.mark.asyncio
    async def test_idle_mis_datos_keyword_5_not_handled_by_fsm(self) -> None:
        """Tecla '5' desde idle → not handled by FSM (delegated to conversational router)."""
        args = _args(user_input="5", ai_intent="ver_mis_datos", ai_confidence=0.95)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is False

    @pytest.mark.asyncio
    async def test_idle_mis_datos_keyword_mi_perfil_not_handled_by_fsm(self) -> None:
        """'mi perfil' desde idle → not handled by FSM (delegated to conversational router)."""
        args = _args(user_input="mi perfil", ai_intent="ver_mis_datos", ai_confidence=0.95)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is False

    # --- /start ---

    @pytest.mark.asyncio
    async def test_idle_start_command_shows_menu(self) -> None:
        """/start desde idle → muestra menú principal."""
        args = _args(user_input="/start")
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "idle"
        assert "Menú" in data["response_text"]


# ============================================================================
# LEVEL 2: AGENDAR — Booking FSM Wizard (4 steps + confirmation)
# ============================================================================


class TestLevel2Agendar_SelectingSpecialty:
    """FSM State: selecting_specialty — select valid, invalid, back, cancel."""

    def test_selecting_specialty_select_valid_index_advances_to_doctor(self) -> None:
        """Seleccionar índice válido (1) → selecting_doctor."""
        state = SelectingSpecialtyState(items=_SPECIALTIES)
        action = SelectAction(value="1")
        outcome = apply_transition(state, action, _EMPTY_DRAFT, items=_DOCTORS_CARDIO)
        assert outcome["advance"] is True
        assert outcome["nextState"].name == "selecting_doctor"

    def test_selecting_specialty_select_valid_id_advances_to_doctor(self) -> None:
        """Seleccionar por ID → selecting_doctor."""
        state = SelectingSpecialtyState(items=_SPECIALTIES)
        action = SelectAction(value="spec-cardio")
        outcome = apply_transition(state, action, _EMPTY_DRAFT, items=_DOCTORS_CARDIO)
        assert outcome["advance"] is True
        assert outcome["nextState"].name == "selecting_doctor"

    def test_selecting_specialty_select_invalid_increments_attempts(self) -> None:
        """Selección inválida → incrementa invalid_attempts."""
        state = SelectingSpecialtyState(items=_SPECIALTIES)
        action = SelectAction(value="99")
        outcome = apply_transition(state, action, _EMPTY_DRAFT)
        assert outcome["advance"] is False
        assert outcome["nextState"].name == "selecting_specialty"
        assert outcome["nextState"].invalid_attempts == 1

    def test_selecting_specialty_select_invalid_3_times_returns_to_menu(self) -> None:
        """3 intentos inválidos → idle con mensaje de error."""
        state = SelectingSpecialtyState(items=_SPECIALTIES, invalid_attempts=2)
        action = SelectAction(value="99")
        outcome = apply_transition(state, action, _EMPTY_DRAFT)
        assert outcome["advance"] is False
        assert outcome["nextState"].name == "idle"
        assert "Demasiados intentos" in outcome["responseText"]

    def test_selecting_specialty_back_returns_to_idle(self) -> None:
        """'volver' desde selecting_specialty → idle."""
        state = SelectingSpecialtyState(items=_SPECIALTIES)
        action = BackAction()
        outcome = apply_transition(state, action, _EMPTY_DRAFT)
        assert outcome["advance"] is False
        assert outcome["nextState"].name == "idle"

    def test_selecting_specialty_cancel_returns_to_idle(self) -> None:
        """'cancelar' desde selecting_specialty → idle."""
        state = SelectingSpecialtyState(items=_SPECIALTIES)
        action = CancelAction()
        outcome = apply_transition(state, action, _EMPTY_DRAFT)
        assert outcome["advance"] is False
        assert outcome["nextState"].name == "idle"


class TestLevel2Agendar_SelectingDoctor:
    """FSM State: selecting_doctor — select valid, invalid, back, cancel."""

    def test_selecting_doctor_select_valid_index_advances_to_time(self) -> None:
        """Seleccionar índice válido (1) → selecting_time."""
        state = SelectingDoctorState(
            specialtyId="spec-cardio",
            specialtyName="Cardiología",
            items=_DOCTORS_CARDIO,
        )
        action = SelectAction(value="1")
        outcome = apply_transition(state, action, _EMPTY_DRAFT, items=_SLOTS)
        assert outcome["advance"] is True
        assert outcome["nextState"].name == "selecting_time"

    def test_selecting_doctor_select_valid_id_advances_to_time(self) -> None:
        """Seleccionar por ID → selecting_time."""
        state = SelectingDoctorState(
            specialtyId="spec-cardio",
            specialtyName="Cardiología",
            items=_DOCTORS_CARDIO,
        )
        action = SelectAction(value="doc-gallegos")
        outcome = apply_transition(state, action, _EMPTY_DRAFT, items=_SLOTS)
        assert outcome["advance"] is True
        assert outcome["nextState"].name == "selecting_time"

    def test_selecting_doctor_select_invalid_increments_attempts(self) -> None:
        """Selección inválida → incrementa invalid_attempts."""
        state = SelectingDoctorState(
            specialtyId="spec-cardio",
            specialtyName="Cardiología",
            items=_DOCTORS_CARDIO,
        )
        action = SelectAction(value="99")
        outcome = apply_transition(state, action, _EMPTY_DRAFT)
        assert outcome["advance"] is False
        assert outcome["nextState"].name == "selecting_doctor"
        assert outcome["nextState"].invalid_attempts == 1

    def test_selecting_doctor_select_invalid_3_times_returns_to_menu(self) -> None:
        """3 intentos inválidos → idle con mensaje de error."""
        state = SelectingDoctorState(
            specialtyId="spec-cardio",
            specialtyName="Cardiología",
            items=_DOCTORS_CARDIO,
            invalid_attempts=2,
        )
        action = SelectAction(value="99")
        outcome = apply_transition(state, action, _EMPTY_DRAFT)
        assert outcome["advance"] is False
        assert outcome["nextState"].name == "idle"
        assert "Demasiados intentos" in outcome["responseText"]

    def test_selecting_doctor_back_returns_to_specialty(self) -> None:
        """'volver' desde selecting_doctor → selecting_specialty."""
        state = SelectingDoctorState(
            specialtyId="spec-cardio",
            specialtyName="Cardiología",
            items=_DOCTORS_CARDIO,
        )
        action = BackAction()
        outcome = apply_transition(state, action, _EMPTY_DRAFT, items=_SPECIALTIES)
        assert outcome["advance"] is False
        assert outcome["nextState"].name == "selecting_specialty"

    def test_selecting_doctor_cancel_returns_to_idle(self) -> None:
        """'cancelar' desde selecting_doctor → idle."""
        state = SelectingDoctorState(
            specialtyId="spec-cardio",
            specialtyName="Cardiología",
            items=_DOCTORS_CARDIO,
        )
        action = CancelAction()
        outcome = apply_transition(state, action, _EMPTY_DRAFT)
        assert outcome["advance"] is False
        assert outcome["nextState"].name == "idle"


class TestLevel2Agendar_SelectingTime:
    """FSM State: selecting_time — select valid, invalid, date, back, cancel."""

    def test_selecting_time_select_valid_index_advances_to_confirming(self) -> None:
        """Seleccionar índice válido (1) → confirming."""
        state = SelectingTimeState(
            specialtyId="spec-cardio",
            doctorId="doc-gallegos",
            doctorName="Dr. Gallegos",
            items=_SLOTS,
        )
        action = SelectAction(value="1")
        outcome = apply_transition(state, action, _EMPTY_DRAFT)
        assert outcome["advance"] is True
        assert outcome["nextState"].name == "confirming"

    def test_selecting_time_select_valid_id_advances_to_confirming(self) -> None:
        """Seleccionar por ID → confirming."""
        state = SelectingTimeState(
            specialtyId="spec-cardio",
            doctorId="doc-gallegos",
            doctorName="Dr. Gallegos",
            items=_SLOTS,
        )
        action = SelectAction(value="slot-1")
        outcome = apply_transition(state, action, _EMPTY_DRAFT)
        assert outcome["advance"] is True
        assert outcome["nextState"].name == "confirming"

    def test_selecting_time_select_date_sets_target_date(self) -> None:
        """Expresión de fecha → establece targetDate."""
        state = SelectingTimeState(
            specialtyId="spec-cardio",
            doctorId="doc-gallegos",
            doctorName="Dr. Gallegos",
            items=_SLOTS,
        )
        action = SelectDateAction(value="2026-05-22")
        outcome = apply_transition(state, action, _EMPTY_DRAFT)
        assert outcome["advance"] is True
        assert outcome["nextState"].name == "selecting_time"
        assert outcome["nextState"].targetDate == "2026-05-22"

    def test_selecting_time_select_invalid_increments_attempts(self) -> None:
        """Selección inválida → incrementa invalid_attempts."""
        state = SelectingTimeState(
            specialtyId="spec-cardio",
            doctorId="doc-gallegos",
            doctorName="Dr. Gallegos",
            items=_SLOTS,
        )
        action = SelectAction(value="99")
        outcome = apply_transition(state, action, _EMPTY_DRAFT)
        assert outcome["advance"] is False
        assert outcome["nextState"].name == "selecting_time"
        assert outcome["nextState"].invalid_attempts == 1

    def test_selecting_time_select_invalid_3_times_returns_to_menu(self) -> None:
        """3 intentos inválidos → idle con mensaje de error."""
        state = SelectingTimeState(
            specialtyId="spec-cardio",
            doctorId="doc-gallegos",
            doctorName="Dr. Gallegos",
            items=_SLOTS,
            invalid_attempts=2,
        )
        action = SelectAction(value="99")
        outcome = apply_transition(state, action, _EMPTY_DRAFT)
        assert outcome["advance"] is False
        assert outcome["nextState"].name == "idle"
        assert "Demasiados intentos" in outcome["responseText"]

    def test_selecting_time_back_returns_to_doctor(self) -> None:
        """'volver' desde selecting_time → selecting_doctor."""
        state = SelectingTimeState(
            specialtyId="spec-cardio",
            doctorId="doc-gallegos",
            doctorName="Dr. Gallegos",
            items=_SLOTS,
        )
        action = BackAction()
        outcome = apply_transition(state, action, _EMPTY_DRAFT, items=_DOCTORS_CARDIO)
        assert outcome["advance"] is False
        assert outcome["nextState"].name == "selecting_doctor"

    def test_selecting_time_cancel_returns_to_idle(self) -> None:
        """'cancelar' desde selecting_time → idle."""
        state = SelectingTimeState(
            specialtyId="spec-cardio",
            doctorId="doc-gallegos",
            doctorName="Dr. Gallegos",
            items=_SLOTS,
        )
        action = CancelAction()
        outcome = apply_transition(state, action, _EMPTY_DRAFT)
        assert outcome["advance"] is False
        assert outcome["nextState"].name == "idle"


class TestLevel2Agendar_Confirming:
    """FSM State: confirming — yes, no, back, invalid."""

    def test_confirming_yes_completes_booking(self) -> None:
        """Confirmar 'sí' → idle con 'Procesando'."""
        state = ConfirmingState(
            specialtyId="spec-cardio",
            doctorId="doc-gallegos",
            doctorName="Dr. Gallegos",
            timeSlot="Lun 18 May · 09:00",
            draft=DraftCore(),
        )
        action = ConfirmYesAction()
        outcome = apply_transition(state, action, _EMPTY_DRAFT)
        assert outcome["advance"] is True
        assert outcome["nextState"].name == "idle"
        assert "Procesando" in outcome["responseText"]

    def test_confirming_yes_via_select_1_completes_booking(self) -> None:
        """Seleccionar '1' en confirming → completa (atajo numérico)."""
        state = ConfirmingState(
            specialtyId="spec-cardio",
            doctorId="doc-gallegos",
            doctorName="Dr. Gallegos",
            timeSlot="Lun 18 May · 09:00",
            draft=DraftCore(),
        )
        action = SelectAction(value="1")
        outcome = apply_transition(state, action, _EMPTY_DRAFT)
        assert outcome["advance"] is True
        assert outcome["nextState"].name == "idle"

    def test_confirming_no_returns_to_selecting_time(self) -> None:
        """Confirmar 'no' → selecting_time."""
        state = ConfirmingState(
            specialtyId="spec-cardio",
            doctorId="doc-gallegos",
            doctorName="Dr. Gallegos",
            timeSlot="Lun 18 May · 09:00",
            draft=DraftCore(),
        )
        action = ConfirmNoAction()
        outcome = apply_transition(state, action, _EMPTY_DRAFT, items=_SLOTS)
        assert outcome["advance"] is False
        assert outcome["nextState"].name == "selecting_time"

    def test_confirming_back_returns_to_selecting_time(self) -> None:
        """'volver' desde confirming → selecting_time."""
        state = ConfirmingState(
            specialtyId="spec-cardio",
            doctorId="doc-gallegos",
            doctorName="Dr. Gallegos",
            timeSlot="Lun 18 May · 09:00",
            draft=DraftCore(),
        )
        action = BackAction()
        outcome = apply_transition(state, action, _EMPTY_DRAFT, items=_SLOTS)
        assert outcome["advance"] is False
        assert outcome["nextState"].name == "selecting_time"

    def test_confirming_select_2_returns_to_selecting_time(self) -> None:
        """Seleccionar '2' en confirming → selecting_time (atajo numérico)."""
        state = ConfirmingState(
            specialtyId="spec-cardio",
            doctorId="doc-gallegos",
            doctorName="Dr. Gallegos",
            timeSlot="Lun 18 May · 09:00",
            draft=DraftCore(),
        )
        action = SelectAction(value="2")
        outcome = apply_transition(state, action, _EMPTY_DRAFT, items=_SLOTS)
        assert outcome["advance"] is False
        assert outcome["nextState"].name == "selecting_time"

    def test_confirming_invalid_increments_attempts(self) -> None:
        """Respuesta inválida → incrementa invalid_attempts."""
        state = ConfirmingState(
            specialtyId="spec-cardio",
            doctorId="doc-gallegos",
            doctorName="Dr. Gallegos",
            timeSlot="Lun 18 May · 09:00",
            draft=DraftCore(),
        )
        action = SelectAction(value="99")
        outcome = apply_transition(state, action, _EMPTY_DRAFT)
        assert outcome["advance"] is False
        assert outcome["nextState"].name == "confirming"
        assert outcome["nextState"].invalid_attempts == 1

    def test_confirming_invalid_3_times_returns_to_menu(self) -> None:
        """3 intentos inválidos → idle con mensaje de error."""
        state = ConfirmingState(
            specialtyId="spec-cardio",
            doctorId="doc-gallegos",
            doctorName="Dr. Gallegos",
            timeSlot="Lun 18 May · 09:00",
            draft=DraftCore(),
            invalid_attempts=2,
        )
        action = SelectAction(value="99")
        outcome = apply_transition(state, action, _EMPTY_DRAFT)
        assert outcome["advance"] is False
        assert outcome["nextState"].name == "idle"
        assert "Demasiados intentos" in outcome["responseText"]


# ============================================================================
# LEVEL 2: RECORDATORIOS — Config submenu
# ============================================================================


class TestLevel2Recordatorios_Config:
    """Reminder config submenu: channel, window, activate/deactivate all, back."""

    @pytest.mark.asyncio
    async def test_reminders_config_invalid_channel_increments_attempts(self) -> None:
        """rem:ch:invalid → incrementa invalid_attempts."""
        args = _args(
            user_input="rem:ch:invalid",
            state={
                "booking_state": {"name": "reminders_config", "invalid_attempts": 0},
                "booking_draft": {},
                "active_flow": "booking",
            },
        )
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "reminders_config"
        assert data["nextState"]["invalid_attempts"] == 1

    @pytest.mark.asyncio
    async def test_reminders_config_invalid_channel_3_times_returns_to_menu(self) -> None:
        """3 intentos inválidos → idle."""
        args = _args(
            user_input="rem:ch:invalid",
            state={
                "booking_state": {"name": "reminders_config", "invalid_attempts": 2},
                "booking_draft": {},
                "active_flow": "booking",
            },
        )
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "idle"
        assert "Demasiados intentos" in data["response_text"]

    @pytest.mark.asyncio
    async def test_reminders_config_invalid_window_increments_attempts(self) -> None:
        """rem:w:invalid → incrementa invalid_attempts."""
        args = _args(
            user_input="rem:w:invalid",
            state={
                "booking_state": {"name": "reminders_config", "invalid_attempts": 0},
                "booking_draft": {},
                "active_flow": "booking",
            },
        )
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "reminders_config"
        assert data["nextState"]["invalid_attempts"] == 1


# ============================================================================
# FSM INTERRUPT INTENTS — From any active booking state
# ============================================================================


class TestFsmInterruptIntents:
    """Test that interrupt intents work from every FSM state."""

    _FSM_STATES: ClassVar[list[dict[str, Any]]] = [
        {"name": "selecting_specialty"},
        {"name": "selecting_doctor", "specialtyId": "spec-cardio", "specialtyName": "Cardiología"},
        {
            "name": "selecting_time",
            "specialtyId": "spec-cardio",
            "doctorId": "doc-gallegos",
            "doctorName": "Dr. Gallegos",
        },
        {
            "name": "confirming",
            "specialtyId": "spec-cardio",
            "doctorId": "doc-gallegos",
            "doctorName": "Dr. Gallegos",
            "timeSlot": "Lun 18 May · 09:00",
            "draft": {},
        },
    ]

    @pytest.mark.asyncio
    @pytest.mark.parametrize("state", _FSM_STATES, ids=[s["name"] for s in _FSM_STATES])
    async def test_interrupt_saludo_preserves_state(self, state: dict[str, Any]) -> None:
        """'saludo' desde cualquier estado → mantiene estado, muestra menú."""
        args = _args(
            user_input="hola",
            ai_intent="saludo",
            ai_confidence=0.95,
            state={"booking_state": state, "booking_draft": {}, "active_flow": "booking"},
        )
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == state["name"]

    @pytest.mark.asyncio
    @pytest.mark.parametrize("state", _FSM_STATES, ids=[s["name"] for s in _FSM_STATES])
    async def test_interrupt_despedida_preserves_state(self, state: dict[str, Any]) -> None:
        """'despedida' desde cualquier estado → mantiene estado."""
        args = _args(
            user_input="chao",
            ai_intent="despedida",
            ai_confidence=0.95,
            state={"booking_state": state, "booking_draft": {}, "active_flow": "booking"},
        )
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == state["name"]

    @pytest.mark.asyncio
    @pytest.mark.parametrize("state", _FSM_STATES, ids=[s["name"] for s in _FSM_STATES])
    async def test_interrupt_agradecimiento_preserves_state(self, state: dict[str, Any]) -> None:
        """'agradecimiento' desde cualquier estado → mantiene estado."""
        args = _args(
            user_input="gracias",
            ai_intent="agradecimiento",
            ai_confidence=0.95,
            state={"booking_state": state, "booking_draft": {}, "active_flow": "booking"},
        )
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == state["name"]

    @pytest.mark.asyncio
    @pytest.mark.parametrize("state", _FSM_STATES, ids=[s["name"] for s in _FSM_STATES])
    async def test_interrupt_mostrar_menu_preserves_state(self, state: dict[str, Any]) -> None:
        """'mostrar_menu_principal' desde cualquier estado → idle con menú."""
        args = _args(
            user_input="menu",
            ai_intent="mostrar_menu_principal",
            ai_confidence=0.9,
            state={"booking_state": state, "booking_draft": {}, "active_flow": "booking"},
        )
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "idle"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("state", _FSM_STATES, ids=[s["name"] for s in _FSM_STATES])
    async def test_interrupt_cancelar_cita_returns_to_idle(self, state: dict[str, Any]) -> None:
        """'cancelar_cita' desde cualquier estado → idle."""
        args = _args(
            user_input="cancelar mi cita",
            ai_intent="cancelar_cita",
            ai_confidence=0.95,
            state={"booking_state": state, "booking_draft": {}, "active_flow": "booking"},
        )
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "idle"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("state", _FSM_STATES, ids=[s["name"] for s in _FSM_STATES])
    async def test_interrupt_urgencia_returns_to_idle(self, state: dict[str, Any]) -> None:
        """'urgencia' desde cualquier estado → idle con mensaje urgente."""
        args = _args(
            user_input="urgencia medica",
            ai_intent="urgencia",
            ai_confidence=0.9,
            state={"booking_state": state, "booking_draft": {}, "active_flow": "booking"},
        )
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "idle"


# ============================================================================
# PARSE_ACTION — Text-to-action mapping for all menu inputs
# ============================================================================


class TestParseActionAllMenuInputs:
    """Test parse_action for every possible text input across menus."""

    # --- Back/Cancel/Menu keywords ---

    @pytest.mark.parametrize(
        "text",
        ["volver", "back", "atras", "menu", "menú", "inicio"],
    )
    def test_parse_action_back_keywords(self, text: str) -> None:
        """Keywords de back → BackAction."""
        action = parse_action(text)
        assert type(action).__name__ == "BackAction"

    @pytest.mark.parametrize(
        "text",
        ["cancelar", "cancel", "no quiero"],
    )
    def test_parse_action_cancel_keywords(self, text: str) -> None:
        """Keywords de cancel → CancelAction."""
        action = parse_action(text)
        assert type(action).__name__ == "CancelAction"

    # --- Confirmation yes/no ---

    @pytest.mark.parametrize(
        "text",
        ["s", "y", "si", "sí", "yes", "confirmar", "confirmo", "ok", "dale"],
    )
    def test_parse_action_confirm_yes_keywords(self, text: str) -> None:
        """Keywords de confirmación sí → ConfirmYesAction."""
        action = parse_action(text)
        assert type(action).__name__ == "ConfirmYesAction"

    @pytest.mark.parametrize(
        "text",
        ["n", "no", "nop", "nope"],
    )
    def test_parse_action_confirm_no_keywords(self, text: str) -> None:
        """Keywords de confirmación no → ConfirmNoAction."""
        action = parse_action(text)
        assert type(action).__name__ == "ConfirmNoAction"

    # --- Numeric selections ---

    @pytest.mark.parametrize("text", ["1", "2", "3", "10", "99"])
    def test_parse_action_numeric_select(self, text: str) -> None:
        """Números → SelectAction."""
        action = parse_action(text)
        assert type(action).__name__ == "SelectAction"
        assert cast("Any", action).value == text

    # --- Non-numeric text defaults to SelectAction ---

    def test_parse_action_text_defaults_to_select(self) -> None:
        """Texto no reconocido → SelectAction (para matching por nombre)."""
        action = parse_action("Cardiología")
        assert type(action).__name__ == "SelectAction"
        assert cast("Any", action).value == "cardiología"

    # --- Abort keywords → CancelAction ---

    @pytest.mark.parametrize(
        "text",
        [
            "abandono",
            "aborto",
            "salir",
            "dejar",
            "parar",
            "terminar",
            "basta",
            "no mas",
            "no más",
            "desistir",
            "me voy",
            "me rindo",
        ],
    )
    def test_parse_action_abort_keywords(self, text: str) -> None:
        """Keywords de aborto → CancelAction."""
        action = parse_action(text)
        assert type(action).__name__ == "CancelAction"


# ============================================================================
# ABORT KEYWORDS — Router-level interrupt from any FSM state
# ============================================================================


class TestAbortKeywordsInterrupt:
    """Test that abort keywords immediately cancel any active FSM flow."""

    _FSM_STATES: ClassVar[list[dict[str, object]]] = [
        {"name": "selecting_specialty"},
        {"name": "selecting_doctor", "specialtyId": "spec-cardio", "specialtyName": "Cardiología"},
        {
            "name": "selecting_time",
            "specialtyId": "spec-cardio",
            "doctorId": "doc-gallegos",
            "doctorName": "Dr. Gallegos",
        },
        {
            "name": "confirming",
            "specialtyId": "spec-cardio",
            "doctorId": "doc-gallegos",
            "doctorName": "Dr. Gallegos",
            "timeSlot": "Lun 18 May · 09:00",
            "draft": {},
        },
    ]

    @pytest.mark.asyncio
    @pytest.mark.parametrize("keyword", ["abandono", "aborto", "salir", "me voy", "basta"])
    @pytest.mark.parametrize("state", _FSM_STATES, ids=[cast("str", s["name"]) for s in _FSM_STATES])
    async def test_abort_keyword_returns_to_idle(self, keyword: str, state: dict[str, Any]) -> None:
        """Keyword de aborto desde cualquier estado → idle con menú."""
        args = _args(
            user_input=keyword,
            state={"booking_state": state, "booking_draft": {}, "active_flow": "booking"},
        )
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["handled"] is True
        assert data["nextState"]["name"] == "idle"
        assert "cancelado" in data["response_text"].lower() or "menú" in data["response_text"]


# ============================================================================
# FULL FLOW COMBINATORIAL — End-to-end booking wizard
# ============================================================================


class TestFullFlowCombinatorial:
    """End-to-end combinatorial tests: complete booking flows."""

    @pytest.mark.asyncio
    async def test_full_booking_flow_happy_path(self) -> None:
        """Flujo completo: idle → specialty → doctor → time → confirm → idle."""
        state: dict[str, Any] = {"booking_state": {"name": "idle"}, "booking_draft": {}}

        # Step 1: idle → selecting_specialty (needs intent to trigger booking flow)
        args = _args(user_input="1", state=state, items=_SPECIALTIES, ai_intent="crear_cita", ai_confidence=0.95)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["nextState"]["name"] == "selecting_specialty"
        state["booking_state"] = data["nextState"]
        state["active_flow"] = "booking"

        # Step 2: selecting_specialty → selecting_doctor
        args = _args(user_input="1", state=state, items=_DOCTORS_CARDIO)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["nextState"]["name"] == "selecting_doctor"
        state["booking_state"] = data["nextState"]

        # Step 3: selecting_doctor → selecting_time
        args = _args(user_input="1", state=state, items=_SLOTS)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["nextState"]["name"] == "selecting_time"
        state["booking_state"] = data["nextState"]

        # Step 4: selecting_time → confirming
        args = _args(user_input="1", state=state)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["nextState"]["name"] == "confirming"
        state["booking_state"] = data["nextState"]

        # Step 5: confirming → idle (booking processed)
        args = _args(user_input="sí", state=state)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["nextState"]["name"] == "idle"
        assert "Procesando" in data["response_text"]

    @pytest.mark.asyncio
    async def test_full_booking_flow_back_from_each_step(self) -> None:
        """Flujo con 'volver' en cada paso: specialty→idle, doctor→specialty, time→doctor, confirm→time."""
        state: dict[str, Any] = {"booking_state": {"name": "idle"}, "booking_draft": {}}

        # idle → specialty
        args = _args(user_input="1", state=state, items=_SPECIALTIES, ai_intent="crear_cita", ai_confidence=0.95)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        state["booking_state"] = data["nextState"]
        state["active_flow"] = "booking"

        # specialty → idle (back)
        args = _args(user_input="volver", state=state, items=_SPECIALTIES)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["nextState"]["name"] == "idle"

        # idle → specialty → doctor
        state["booking_state"] = {"name": "idle"}
        state["booking_draft"] = {}
        args = _args(user_input="1", state=state, items=_SPECIALTIES, ai_intent="crear_cita", ai_confidence=0.95)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        state["booking_state"] = data["nextState"]
        state["active_flow"] = "booking"

        args = _args(user_input="1", state=state, items=_DOCTORS_CARDIO)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        state["booking_state"] = data["nextState"]

        # doctor → specialty (back) — FSM sets items in nextState, but model_dump may strip empty
        args = _args(user_input="volver", state=state, items=_SPECIALTIES)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["nextState"]["name"] == "selecting_specialty"
        # Ensure items are present in state for next forward transition
        if "items" not in data["nextState"] or not data["nextState"]["items"]:
            data["nextState"]["items"] = _SPECIALTIES
        state["booking_state"] = data["nextState"]

        # specialty → doctor
        args = _args(user_input="1", state=state, items=_DOCTORS_CARDIO)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        state["booking_state"] = data["nextState"]
        state["active_flow"] = "booking"

        # doctor → time
        args = _args(user_input="1", state=state, items=_SLOTS)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        state["booking_state"] = data["nextState"]

        # time → doctor (back)
        args = _args(user_input="volver", state=state, items=_DOCTORS_CARDIO)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["nextState"]["name"] == "selecting_doctor"
        # Ensure items are present
        if "items" not in data["nextState"] or not data["nextState"]["items"]:
            data["nextState"]["items"] = _DOCTORS_CARDIO
        state["booking_state"] = data["nextState"]

        # doctor → time
        args = _args(user_input="1", state=state, items=_SLOTS)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        state["booking_state"] = data["nextState"]
        state["active_flow"] = "booking"

        # time → confirming
        args = _args(user_input="1", state=state)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        state["booking_state"] = data["nextState"]
        state["active_flow"] = "booking"

        # confirming → time (back)
        args = _args(user_input="volver", state=state, items=_SLOTS)
        with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
            res = await _main_async(args)
        data = cast("dict[str, Any]", res["data"])
        assert data["nextState"]["name"] == "selecting_time"

    @pytest.mark.asyncio
    async def test_full_booking_flow_cancel_from_each_step(self) -> None:
        """'cancelar' desde cada paso del wizard → idle."""
        states: list[dict[str, Any]] = [
            {"name": "selecting_specialty", "items": _SPECIALTIES},
            {
                "name": "selecting_doctor",
                "specialtyId": "spec-cardio",
                "specialtyName": "Cardiología",
                "items": _DOCTORS_CARDIO,
            },
            {
                "name": "selecting_time",
                "specialtyId": "spec-cardio",
                "doctorId": "doc-gallegos",
                "doctorName": "Dr. Gallegos",
                "items": _SLOTS,
            },
            {
                "name": "confirming",
                "specialtyId": "spec-cardio",
                "doctorId": "doc-gallegos",
                "doctorName": "Dr. Gallegos",
                "timeSlot": "Lun 18 May · 09:00",
                "draft": {},
            },
        ]

        for s in states:
            state = {"booking_state": s, "booking_draft": {}, "active_flow": "booking"}
            args = _args(user_input="cancelar", state=state)
            with patch("f.internal._nlu_cache.ensure_nlu_cache", AsyncMock()):
                res = await _main_async(args)
            data = cast("dict[str, Any]", res["data"])
            assert data["handled"] is True, f"Cancel from {s['name']} should be handled"
            assert data["nextState"]["name"] == "idle", f"Cancel from {s['name']} should return to idle"
