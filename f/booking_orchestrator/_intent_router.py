from typing import Optional, Callable, Awaitable
from ._orchestrator_models import CanonicalIntent, OrchestratorInput, OrchestratorResult
from ..internal._result import Result, DBClient

"""
PRE-FLIGHT
Mission          : Intent normalization and routing mapping.
DB Tables        : NONE
Concurrency Risk : NO
GCal Calls       : NO
Idempotency Key  : NO
RLS Tenant ID    : NO
Zod Schemas      : NO
"""

LEGACY_INTENT_MAP: dict[str, CanonicalIntent] = {
    "reagendar": "reagendar_cita",
    "consultar_disponible": "ver_disponibilidad",
    "consultar_disponibilidad": "ver_disponibilidad",
    "ver_mis_citas": "mis_citas",
}

AUTHORIZED_INTENTS = [
    "crear_cita",
    "cancelar_cita",
    "reagendar_cita",
    "ver_disponibilidad",
    "mis_citas",
]

def normalize_intent(intent: str) -> Optional[CanonicalIntent]:
    """Maps legacy or relative intent names to canonical ones."""
    mapped = LEGACY_INTENT_MAP.get(intent)
    if mapped:
        return mapped
    if intent in AUTHORIZED_INTENTS:
        return intent  # type: ignore
    return None

# Type alias for handlers
OrchestratorHandler = Callable[[DBClient, OrchestratorInput], Awaitable[Result[OrchestratorResult]]]
