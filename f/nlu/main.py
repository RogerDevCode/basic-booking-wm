from typing import Any, TypedDict
from f.nlu._constants import INTENT, CONFIDENCE_BOUNDARIES
from f.nlu._tfidf_classifier import classify_intent

"""
PRE-FLIGHT
Mission          : NLU Intent Extraction Motor (Python port).
DB Tables Used   : NONE
Concurrency Risk : NO
GCal Calls       : NO
Idempotency Key  : NO
RLS Tenant ID    : NO
Zod Schemas      : NO — manual dict validation for wmill compatibility
"""

class ExtractedIntent(TypedDict):
    intent: str
    confidence: float
    entities: dict[str, Any]
    requires_human: bool

async def main(args: Any) -> ExtractedIntent:
    """
    NLU Motor — Extracts intent and confidence from user text.
    Adheres to AGENTS.md §5.1 and §5.4.
    """
    if not isinstance(args, dict):
        return {
            "intent": INTENT["DESCONOCIDO"],
            "confidence": 0.0,
            "entities": {},
            "requires_human": False
        }
    
    text = args.get("text", "")
    if not text:
        return {
            "intent": INTENT["DESCONOCIDO"],
            "confidence": 0.0,
            "entities": {},
            "requires_human": False
        }

    # 1. Intent Classification (using TF-IDF as the primary engine for now)
    result = classify_intent(text)
    
    # 2. Determine if human escalation is required
    # Emergency or extremely low confidence triggers human intervention
    requires_human = result["intent"] == INTENT["URGENCIA"] or result["confidence"] < 0.4

    return {
        "intent": result["intent"],
        "confidence": result["confidence"],
        "entities": {},  # Entity extraction delegated to specialized modules or next sub-phase
        "requires_human": requires_human
    }
