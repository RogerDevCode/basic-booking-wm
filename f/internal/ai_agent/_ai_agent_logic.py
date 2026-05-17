from __future__ import annotations

import re
from typing import Literal, cast

from .._nlu_cache import get_nlu_rule
from ._ai_agent_models import AvailabilityContext, ConversationState, EntityMap, EscalationLevel
from ._constants import (
    FAREWELL_PHRASES,
    FAREWELLS,
    GREETING_PHRASES,
    GREETINGS,
    INTENT,
    THANK_YOU_WORDS,
    URGENCY_WORDS,
)

# ============================================================================
# FSM ROUTING DECISION
# ============================================================================

_FSM_INTENTS: frozenset[str] = frozenset({"crear_cita", "cancelar_cita", "reagendar_cita", "ver_disponibilidad"})

_FSM_ACTIVE_STATES: frozenset[str] = frozenset(
    {
        "selecting_specialty",
        "selecting_doctor",
        "selecting_time",
        "confirming",
        "needs_registration",
        "reg_confirming_name",
        "reg_entering_name",
        "reg_collecting_phone",
        "reg_collecting_email",
        # reminders_config is handled by fsm_router delegating to _router_reminders.py.
        # We keep it here to ensure that free-text inputs while in this state
        # are routed through the FSM protector.
        "reminders_config",
    }
)


def compute_requires_fsm_routing(intent: str, booking_state_name: str) -> bool:
    """Returns True if this message must go through the FSM router."""
    if booking_state_name in _FSM_ACTIVE_STATES:
        return True
    return intent in _FSM_INTENTS and booking_state_name == "idle"


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

    if state.active_flow == "booking_wizard" and lower in ["s", "y", "si", "sí", "confirmar", "confirmo", "yes"]:
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

    relative_dates: list[str] = get_nlu_rule("relative_dates", [])
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
        day_names: dict[str, str] = get_nlu_rule("day_names", {})
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
        # "el/la dr/dra/doctor/doctora X" — most common: "tiene el dr gallegos"
        r"(?:el|la)\s+(?:dr|dra|doctor|doctora)\.?\s+([A-Za-záéíóúüñÁÉÍÓÚÜÑ]+)",
        # "con/para [el/la] dr X"
        r"(?:con|para)\s+(?:el|la\s+)?(?:dr|dra|doctor|doctora)\.?\s+([A-Za-záéíóúüñÁÉÍÓÚÜÑ]+)",
        # bare "dr X" anywhere
        r"(?:dr|dra|doctor|doctora)\.?\s+([A-Za-záéíóúüñÁÉÍÓÚÜÑ]+)",
    ]
    for p in provider_patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            data["provider_name"] = m.group(1)
            break

    service_types: list[str] = get_nlu_rule("service_types", [])
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

    urgency_words: list[str] = get_nlu_rule("urgency_words", []) or URGENCY_WORDS
    is_urgent = any(w in lower for w in urgency_words)

    flex_keywords: list[str] = get_nlu_rule("flexibility_keywords", [])
    is_flexible = any(w in lower for w in flex_keywords)

    time_pref: Literal["morning", "afternoon", "evening", "any"] = "any"
    if any(x in lower for x in ["mañana", "manana"]):
        time_pref = "morning"
    elif "tarde" in lower:
        time_pref = "afternoon"
    elif "noche" in lower:
        time_pref = "evening"

    day_pref = None
    day_names: dict[str, str] = get_nlu_rule("day_names", {})
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

    greetings: list[str] = get_nlu_rule("greetings", []) or GREETINGS
    greeting_phrases: list[str] = get_nlu_rule("greeting_phrases", []) or GREETING_PHRASES
    farewells: list[str] = get_nlu_rule("farewells", []) or FAREWELLS
    farewell_phrases: list[str] = get_nlu_rule("farewell_phrases", []) or FAREWELL_PHRASES

    if lower in greetings:
        return cast("tuple[str, float]", (INTENT["SALUDO"], 0.95))
    if any(p in lower for p in greeting_phrases):
        return cast("tuple[str, float]", (INTENT["SALUDO"], 0.9))
    if lower in farewells:
        return cast("tuple[str, float]", (INTENT["DESPEDIDA"], 0.95))
    if any(p in lower for p in farewell_phrases):
        return cast("tuple[str, float]", (INTENT["DESPEDIDA"], 0.9))
    thank_you_words: list[str] = get_nlu_rule("thank_you_words", []) or THANK_YOU_WORDS
    if lower in thank_you_words or any(p in lower for p in thank_you_words):
        return cast("tuple[str, float]", (INTENT["AGRADECIMIENTO"], 0.95))
    return None


# ============================================================================
# MENU FAST-PATH (deterministic numbered/keyword main-menu selection)
# ============================================================================
#
# The main menu is presented as text ("1️⃣ Agendar … 5️⃣ Mis datos"), so users
# reply with bare digits. TF-IDF cannot classify single tokens (it needs >=2
# words), so without this deterministic fast-path the numbered menu is dead.
# Caller MUST gate this on booking_state_name == "idle": mid-FSM a digit means
# slot/specialty selection and must reach the FSM untouched.

_MENU_AGENDAR: frozenset[str] = frozenset(
    {"1", "agendar", "agendar cita", "agendar hora", "nueva cita", "nueva hora", "pedir hora", "tomar hora"}
)
_MENU_MIS_CITAS: frozenset[str] = frozenset(
    {
        "2",
        "mis citas",
        "mis horas",
        "consultar",
        "consultar citas",
        "consultar horas",
        "ver citas",
        "ver horas",
        "ver mis citas",
        "ver mis horas",
    }
)
_MENU_RECORDATORIOS: frozenset[str] = frozenset({"3", "recordatorios", "recordatorio"})
_MENU_INFO: frozenset[str] = frozenset({"4", "informacion", "información", "info"})
_MENU_MIS_DATOS: frozenset[str] = frozenset({"5", "mis datos", "datos", "mi perfil", "perfil", "ver mis datos"})


def detect_menu_command(text: str) -> tuple[str, float] | None:
    """Map an exact main-menu selection (digit or alias) to a canonical intent.

    Only valid from the idle state — the caller is responsible for that gate.
    """
    lower = text.strip().lower()
    if lower in _MENU_AGENDAR:
        return cast("tuple[str, float]", (INTENT["CREAR_CITA"], 0.97))
    if lower in _MENU_MIS_CITAS:
        return cast("tuple[str, float]", (INTENT["VER_MIS_CITAS"], 0.97))
    if lower in _MENU_RECORDATORIOS:
        return cast("tuple[str, float]", (INTENT["ACTIVAR_RECORDATORIOS"], 0.97))
    if lower in _MENU_INFO:
        return cast("tuple[str, float]", (INTENT["PREGUNTA_GENERAL"], 0.97))
    if lower in _MENU_MIS_DATOS:
        return cast("tuple[str, float]", (INTENT["VER_MIS_DATOS"], 0.97))
    return None
