from __future__ import annotations
import asyncio
import os
from typing import Any, TypedDict, cast
from ._constants import INTENT
from ._tfidf_classifier import classify_intent

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
    entities: dict[str, object]
    requires_human: bool

async def _main_async(args: dict[str, object]) -> ExtractedIntent:
    """
    NLU Motor — Extracts intent and confidence from user text.
    Adheres to AGENTS.md §5.1 and §5.4.
    """
    text = str(args.get("text", ""))
    if not text:
        return {
            "intent": INTENT["DESCONOCIDO"],
            "confidence": 0.0,
            "entities": {},
            "requires_human": False
        }

    # 1. Intent Classification
    result = classify_intent(text)
    
    # 2. Determine if human escalation is required
    requires_human = result["intent"] == INTENT["URGENCIA"] or result["confidence"] < 0.4

    return {
        "intent": result["intent"],
        "confidence": result["confidence"],
        "entities": {},
        "requires_human": requires_human
    }


def main(args: dict[str, object]) -> ExtractedIntent | None:
    import traceback
    try:
        return asyncio.run(_main_async(args))
    except Exception as e:
        tb = traceback.format_exc()
        try:
            from ..internal._wmill_adapter import log
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module="nlu")
        except Exception:
            print(f"CRITICAL ERROR in nlu: {e}\n{tb}")
        
        # Elevamos para que Windmill marque como FAILED
        raise RuntimeError(f"Execution failed: {e}")
