from typing import Any
from f.nlu._constants import (
    CONFIDENCE_BOUNDARIES,
    CONFIDENCE_THRESHOLDS,
    ESCALATION_THRESHOLDS,
    FAREWELLS,
    GREETINGS,
    INTENT,
    INTENT_KEYWORDS,
    NORMALIZATION_MAP,
    RULE_CONFIDENCE_VALUES,
    SOCIAL_CONFIDENCE_VALUES,
    THANK_YOU_WORDS,
    URGENCY_WORDS,
)


def test_nlu_constants_exist() -> None:
    # Contract validation: ensure all exports exist and match expected shapes
    assert isinstance(INTENT, dict)
    assert INTENT["CREAR_CITA"] == "crear_cita"

    assert isinstance(CONFIDENCE_THRESHOLDS, dict)
    assert CONFIDENCE_THRESHOLDS["urgencia"] == 0.5

    assert isinstance(CONFIDENCE_BOUNDARIES, dict)
    assert CONFIDENCE_BOUNDARIES["HIGH_MIN"] == 0.85

    assert isinstance(INTENT_KEYWORDS, dict)
    assert "urgencia" in INTENT_KEYWORDS

    assert isinstance(NORMALIZATION_MAP, dict)
    assert NORMALIZATION_MAP["ajendar"] == "agendar"

    assert isinstance(ESCALATION_THRESHOLDS, dict)
    assert ESCALATION_THRESHOLDS["medical_emergency_min"] == 0.8

    assert isinstance(RULE_CONFIDENCE_VALUES, dict)
    assert RULE_CONFIDENCE_VALUES["urgencia_medical"] == 0.9

    assert isinstance(SOCIAL_CONFIDENCE_VALUES, dict)
    assert SOCIAL_CONFIDENCE_VALUES["greeting_exact"] == 0.95

    assert isinstance(URGENCY_WORDS, list)
    assert "urgente" in URGENCY_WORDS

    assert isinstance(GREETINGS, list)
    assert "hola" in GREETINGS

    assert isinstance(FAREWELLS, list)
    assert "adiós" in FAREWELLS

    assert isinstance(THANK_YOU_WORDS, list)
    assert "gracias" in THANK_YOU_WORDS
