from __future__ import annotations

from f.internal.ai_agent._ai_agent_logic import (
    adjust_intent_with_context,
    compute_requires_fsm_routing,
    detect_context,
    detect_menu_command,
    detect_social,
    extract_entities,
)
from f.internal.ai_agent._ai_agent_models import ConversationState, EntityMap
from f.internal.ai_agent._constants import INTENT


class TestAIAgentLogic:
    """Unit tests for AI Agent core logic."""

    def test_extract_entities_date(self) -> None:
        # Arrange
        text = "Quiero una cita para el 2026-05-15"
        # Act
        entities = extract_entities(text)
        # Assert
        assert entities.date == "2026-05-15"

    def test_extract_entities_provider(self) -> None:
        # Arrange
        text = "con el doctor Garcia"
        # Act
        entities = extract_entities(text)
        # Assert
        assert entities.provider_name == "Garcia"

    def test_extract_entities_provider_lowercase_surname(self) -> None:
        # Regression: "[A-Z][a-z]+" required uppercase start — failed for "el dr gallegos"
        text = "que horas tiene el dr gallegos"
        entities = extract_entities(text)
        assert entities.provider_name == "gallegos"

    def test_extract_entities_provider_dra_title(self) -> None:
        # "dra" title was not in original pattern list
        text = "la doctora muñoz tiene hora mañana"
        entities = extract_entities(text)
        assert entities.provider_name == "muñoz"

    def test_extract_entities_provider_bare_dr_lowercase(self) -> None:
        # Bare "dr X" without preceding article, lowercase surname
        text = "quiero hora con dr soto"
        entities = extract_entities(text)
        assert entities.provider_name == "soto"

    def test_detect_social_greeting(self) -> None:
        # Arrange
        text = "Hola"
        # Act
        res = detect_social(text)
        # Assert
        assert res is not None
        assert res[0] == INTENT["SALUDO"]

    def test_adjust_intent_with_context_wizard(self) -> None:
        # Arrange
        state = ConversationState(active_flow="booking_wizard")
        text = "si"
        # Act
        adj = adjust_intent_with_context(text, str(INTENT["DESCONOCIDO"]), 0.1, state)
        # Assert
        assert adj["adjusted"] is True
        assert adj["intent"] == INTENT["CREAR_CITA"]

    def test_detect_context_urgency(self) -> None:
        # Arrange
        text = "Es una urgencia ahora mismo"
        entities = EntityMap()
        # Act
        ctx = detect_context(text, entities)
        # Assert
        assert ctx.is_urgent is True

    def test_detect_menu_command_agendar_digit_returns_crear_cita(self) -> None:
        # Arrange
        text = "1"
        # Act
        res = detect_menu_command(text)
        # Assert
        assert res is not None
        assert res[0] == INTENT["CREAR_CITA"]

    def test_detect_menu_command_mis_citas_digit_returns_ver_mis_citas(self) -> None:
        # Arrange
        text = "2"
        # Act
        res = detect_menu_command(text)
        # Assert
        assert res is not None
        assert res[0] == INTENT["VER_MIS_CITAS"]

    def test_detect_menu_command_reporte_digit_returns_generar_reporte(self) -> None:
        # Arrange
        text = "3"
        # Act
        res = detect_menu_command(text)
        # Assert
        assert res is not None
        assert res[0] == INTENT["GENERAR_REPORTE"]

    def test_detect_menu_command_recordatorios_digit_returns_activar(self) -> None:
        # Arrange
        text = "4"
        # Act
        res = detect_menu_command(text)
        # Assert
        assert res is not None
        assert res[0] == INTENT["ACTIVAR_RECORDATORIOS"]

    def test_detect_menu_command_info_digit_returns_pregunta_general(self) -> None:
        # Arrange
        text = "5"
        # Act
        res = detect_menu_command(text)
        # Assert
        assert res is not None
        assert res[0] == INTENT["PREGUNTA_GENERAL"]

    def test_detect_menu_command_mis_datos_digit_returns_ver_mis_datos(self) -> None:
        # Arrange
        text = "6"
        # Act
        res = detect_menu_command(text)
        # Assert
        assert res is not None
        assert res[0] == INTENT["VER_MIS_DATOS"]

    def test_detect_menu_command_keyword_alias_returns_crear_cita(self) -> None:
        # Arrange
        text = "Agendar Hora"
        # Act
        res = detect_menu_command(text)
        # Assert
        assert res is not None
        assert res[0] == INTENT["CREAR_CITA"]

    def test_detect_menu_command_freeform_returns_none(self) -> None:
        # Arrange
        text = "quiero saber cuánto cuesta una consulta"
        # Act
        res = detect_menu_command(text)
        # Assert
        assert res is None

    def test_compute_requires_fsm_routing_booking_from_idle_true(self) -> None:
        # Act
        result = compute_requires_fsm_routing(str(INTENT["CREAR_CITA"]), "idle")
        # Assert
        assert result is True

    def test_compute_requires_fsm_routing_social_from_idle_false(self) -> None:
        # Act
        result = compute_requires_fsm_routing(str(INTENT["SALUDO"]), "idle")
        # Assert
        assert result is False

    def test_compute_requires_fsm_routing_mid_fsm_low_conf_true(self) -> None:
        # Act — interrupt intent but low confidence → must stay in FSM
        result = compute_requires_fsm_routing(str(INTENT["SALUDO"]), "selecting_doctor", confidence=0.5)
        # Assert
        assert result is True

    def test_compute_requires_fsm_routing_mid_fsm_interrupt_high_conf_false(self) -> None:
        # Act — interrupt intent with high confidence → allows conversational router
        result = compute_requires_fsm_routing(str(INTENT["SALUDO"]), "selecting_doctor", confidence=0.95)
        # Assert
        assert result is False

    def test_compute_requires_fsm_routing_mid_fsm_non_interrupt_true(self) -> None:
        # Act — non-interrupt intent mid-flow → must stay in FSM
        result = compute_requires_fsm_routing(str(INTENT["CREAR_CITA"]), "selecting_doctor", confidence=0.9)
        # Assert
        assert result is True

    def test_compute_requires_fsm_routing_ver_mis_citas_from_idle_false(self) -> None:
        # Act — menu option 2 is conversational, not FSM
        result = compute_requires_fsm_routing(str(INTENT["VER_MIS_CITAS"]), "idle")
        # Assert
        assert result is False
