from __future__ import annotations

import re
from typing import Literal, cast

from ._ai_agent_models import AvailabilityContext, ConversationState, EntityMap, EscalationLevel
from ._constants import (
    CONFIDENCE_BOUNDARIES,
    DAY_NAMES,
    ESCALATION_THRESHOLDS,
    FAREWELL_PHRASES,
    FAREWELLS,
    FLEXIBILITY_KEYWORDS,
    GREETING_PHRASES,
    GREETINGS,
    INTENT,
    RELATIVE_DATES,
    SERVICE_TYPES,
    SOCIAL_CONFIDENCE_VALUES,
    URGENCY_WORDS,
)

# ============================================================================
# CONTEXT-AWARE INTENT ADJUSTMENT
# ============================================================================


def adjust_intent_with_context(
    text: str, current_intent: str, current_confidence: float, state: ConversationState | None
) -> dict[str, object]:
    if state is None:
        return {"adjusted": False, "intent": current_intent, "confidence": current_confidence, "reason": ""}

    lower = text.strip().lower()

    if (state.active_flow in ["selecting_specialty", "booking_wizard"]) and re.match(r"^\d+$", lower):
        return {
            "adjusted": True,
            "intent": INTENT["CREAR_CITA"],
            "confidence": 0.95,
            "reason": f"Context: user selected specialty #{lower} in {state.active_flow} flow",
        }

    if state.active_flow == "selecting_datetime" and re.match(r"^\d", lower):
        return {
            "adjusted": True,
            "intent": INTENT["CREAR_CITA"],
            "confidence": 0.90,
            "reason": "Context: user provided date/time in datetime selection flow",
        }

    if state.active_flow != "none" and lower in ["no", "volver", "menu", "menú", "inicio"]:
        return {
            "adjusted": True,
            "intent": INTENT["PREGUNTA_GENERAL"],
            "confidence": CONFIDENCE_BOUNDARIES["HIGH_MIN"],
            "reason": f"Context: user wants to exit current flow ({state.active_flow})",
        }

    if state.active_flow == "booking_wizard" and lower in ["si", "sí", "confirmar", "confirmo", "yes"]:
        return {
            "adjusted": True,
            "intent": INTENT["CREAR_CITA"],
            "confidence": 0.95,
            "reason": "Context: user confirmed booking in wizard flow",
        }

    return {"adjusted": False, "intent": current_intent, "confidence": current_confidence, "reason": ""}


# ============================================================================
# ENTITY EXTRACTION
# ============================================================================


def extract_entities(text: str) -> EntityMap:
    lower_text = text.lower()
    data: dict[str, str | None] = {
        "date": None,
        "time": None,
        "provider_name": None,
        "provider_id": None,
        "service_type": None,
        "service_id": None,
        "booking_id": None,
        "channel": None,
        "reminder_window": None,
    }

    for rel in RELATIVE_DATES:
        if rel in lower_text:
            data["date"] = rel
            break

    if not data["date"]:
        patterns = [
            r"\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b",
            r"\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b",
            r"\b(\d{1,2}[-/]\d{1,2})\b",
        ]
        for p in patterns:
            m = re.search(p, text)
            if m:
                data["date"] = m.group(1)
                break

    if not data["date"]:
        for day in DAY_NAMES:
            if day in lower_text:
                data["date"] = day
                break

    time_patterns = [
        r"(\d{1,2}:\d{2}\s*(?:am|pm|hrs|horas)?)",
        r"(\d{1,2}\s*(?:am|pm|hrs|horas))",
        r"las\s*(\d{1,2})\s*(?:am|pm|horas)?",
    ]
    for p in time_patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            data["time"] = m.group(1).strip()
            break

    provider_patterns = [
        r"(?:dr|doctor|doctora)\.?\s+([A-Z][a-z]+)",
        r"(?:con|para)\s+el\s+(?:dr|doctor)\.?\s+([A-Z][a-z]+)",
    ]
    for p in provider_patterns:
        m = re.search(p, text)
        if m:
            data["provider_name"] = f"Dr. {m.group(1)}"
            break

    for service in SERVICE_TYPES:
        if service in lower_text:
            data["service_type"] = service
            break

    booking_patterns = [r"\b([A-Z]{2,3}-\d{3,4})\b", r"#(\d{3,6})\b", r"reserva\s+(\d{3,6})\b"]
    for p in booking_patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            data["booking_id"] = m.group(1)
            break

    return EntityMap(**data)


def detect_context(text: str, entities: EntityMap) -> AvailabilityContext:
    lower = text.lower()
    is_today = "hoy" in lower or entities.date == "hoy"
    is_tomorrow = any(x in lower for x in ["mañana", "manana"]) or entities.date == "mañana"
    is_urgent = any(w in lower for w in URGENCY_WORDS)
    is_flexible = any(w in lower for w in FLEXIBILITY_KEYWORDS)

    time_pref: Literal["morning", "afternoon", "evening", "any"] = "any"
    if any(x in lower for x in ["mañana", "manana"]):
        time_pref = "morning"
    elif "tarde" in lower:
        time_pref = "afternoon"
    elif "noche" in lower:
        time_pref = "evening"

    day_pref = None
    for day, full in DAY_NAMES.items():
        if day in lower:
            day_pref = full
            break

    return AvailabilityContext(
        is_today=is_today,
        is_tomorrow=is_tomorrow,
        is_urgent=is_urgent,
        is_flexible=is_flexible,
        is_specific_date=entities.date is not None,
        time_preference=time_pref,
        day_preference=day_pref,
    )


def determine_escalation_level(intent: str, text: str, confidence: float) -> EscalationLevel:
    lower = text.lower()
    if intent == INTENT["URGENCIA"] and confidence >= ESCALATION_THRESHOLDS["medical_emergency_min"]:
        patterns = (
            r"muerte|morir|no respiro|infarto|desmay|sangr|convul|paro|dolor.*pecho|dificultad.*respir|no puedo.*respir"
        )
        if re.search(patterns, lower):
            return "medical_emergency"

    if intent == INTENT["URGENCIA"] and confidence < ESCALATION_THRESHOLDS["priority_queue_max"]:
        return "priority_queue"

    if confidence < ESCALATION_THRESHOLDS["human_handoff_max"] and intent not in [
        INTENT["SALUDO"],
        INTENT["DESPEDIDA"],
        INTENT["AGRADECIMIENTO"],
    ]:
        return "human_handoff"

    return "none"


def generate_ai_response(
    intent: str, entities: EntityMap, context: AvailabilityContext, user_profile: object | None = None
) -> tuple[str, bool, str | None]:
    # simplified for logic
    if intent == INTENT["SALUDO"]:
        return (
            "Hola, soy tu asistente médico. ¿En qué puedo ayudarte?",
            True,
            "¿Deseas agendar, cancelar o cambiar una cita?",
        )

    if intent == INTENT["URGENCIA"]:
        return "Entiendo que es una situación urgente. He localizado espacios prioritarios.", False, None

    return f"He procesado tu solicitud de {intent}.", False, None


def detect_social(text: str) -> tuple[str, float] | None:
    lower = text.lower().strip()
    if lower in GREETINGS:
        return cast("tuple[str, float]", (INTENT["SALUDO"], SOCIAL_CONFIDENCE_VALUES["greeting_exact"]))
    if any(p in lower for p in GREETING_PHRASES):
        return cast("tuple[str, float]", (INTENT["SALUDO"], SOCIAL_CONFIDENCE_VALUES["greeting_phrase"]))
    if lower in FAREWELLS:
        return cast("tuple[str, float]", (INTENT["DESPEDIDA"], SOCIAL_CONFIDENCE_VALUES["farewell_exact"]))
    if any(p in lower for p in FAREWELL_PHRASES):
        return cast("tuple[str, float]", (INTENT["DESPEDIDA"], SOCIAL_CONFIDENCE_VALUES["farewell_phrase"]))
    return None
