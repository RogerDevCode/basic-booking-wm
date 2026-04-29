from typing import Any
from __future__ import annotations

import pytest
from f.internal.ai_agent._ai_agent_logic import (
    adjust_intent_with_context,
    detect_context,
    extract_entities,
    detect_social,
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
        assert entities.provider_name == "Dr. Garcia"

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
