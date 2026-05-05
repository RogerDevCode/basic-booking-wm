from __future__ import annotations

import re
from typing import Literal, cast

from ._ai_agent_models import AvailabilityContext, ConversationState, EntityMap, EscalationLevel
from ._constants import INTENT
from ._rules_service import get_nlu_rule

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
        high_min = get_nlu_rule("confidence_bound_high_min", 0.85)
        return {
            "adjusted": True,
            "intent": INTENT["PREGUNTA_GENERAL"],
            "confidence": float(high_min),
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

    relative_dates = get_nlu_rule("relative_dates", [])
    for rel in relative_dates:
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
        day_names = get_nlu_rule("day_names", {})
        for day in day_names:
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

    service_types = get_nlu_rule("service_types", [])
    for service in service_types:
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
    
    urgency_words = get_nlu_rule("urgency_words", [])
    is_urgent = any(w in lower for w in urgency_words)
    
    flex_keywords = get_nlu_rule("flexibility_keywords", [])
    is_flexible = any(w in lower for w in flex_keywords)

    time_pref: Literal["morning", "afternoon", "evening", "any"] = "any"
    if any(x in lower for x in ["mañana", "manana"]):
        time_pref = "morning"
    elif "tarde" in lower:
        time_pref = "afternoon"
    elif "noche" in lower:
        time_pref = "evening"

    day_pref = None
    day_names = get_nlu_rule("day_names", {})
    for day, full in day_names.items():
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
    med_min = float(get_nlu_rule("escalation_medical_emergency_min", 0.8))
    if intent == INTENT["URGENCIA"] and confidence >= med_min:
        patterns = (
            r"muerte|morir|no respiro|infarto|desmay|sangr|convul|paro|dolor.*pecho|dificultad.*respir|no puedo.*respir"
        )
        if re.search(patterns, lower):
            return "medical_emergency"

    pri_max = float(get_nlu_rule("escalation_priority_queue_max", 0.6))
    if intent == INTENT["URGENCIA"] and confidence < pri_max:
        return "priority_queue"

    hum_max = float(get_nlu_rule("escalation_human_handoff_max", 0.4))
    if confidence < hum_max and intent not in [
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
    
    greetings = get_nlu_rule("greetings", [])
    greeting_phrases = get_nlu_rule("greeting_phrases", [])
    farewells = get_nlu_rule("farewells", [])
    farewell_phrases = get_nlu_rule("farewell_phrases", [])

    if lower in greetings:
        return cast("tuple[str, float]", (INTENT["SALUDO"], 0.95))
    if any(p in lower for p in greeting_phrases):
        return cast("tuple[str, float]", (INTENT["SALUDO"], 0.9))
    if lower in farewells:
        return cast("tuple[str, float]", (INTENT["DESPEDIDA"], 0.95))
    if any(p in lower for p in farewell_phrases):
        return cast("tuple[str, float]", (INTENT["DESPEDIDA"], 0.9))
    return None
