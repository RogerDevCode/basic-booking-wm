from typing import Any, Literal, Optional, TypedDict
from pydantic import BaseModel, ConfigDict, Field

"""
PRE-FLIGHT
Mission          : Orchestrator models for input validation and internal data structures.
DB Tables        : NONE
Concurrency Risk : NO
GCal Calls       : NO
Idempotency Key  : NO
RLS Tenant ID    : NO
Zod Schemas      : YES — Pydantic equivalent of InputSchema
"""

CanonicalIntent = Literal[
    "crear_cita",
    "cancelar_cita",
    "reagendar_cita",
    "ver_disponibilidad",
    "mis_citas",
]

ExtendedIntent = Literal[
    "crear_cita",
    "cancelar_cita",
    "reagendar_cita",
    "ver_disponibilidad",
    "mis_citas",
    "reagendar",
    "consultar_disponible",
    "consultar_disponibilidad",
    "ver_mis_citas",
]

class OrchestratorInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    tenant_id: Optional[str] = None
    intent: ExtendedIntent
    entities: dict[str, Optional[str]] = Field(default_factory=dict)
    client_id: Optional[str] = None
    provider_id: Optional[str] = None
    service_id: Optional[str] = None
    booking_id: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    notes: Optional[str] = None
    channel: Literal["telegram", "web", "api"] = "api"
    telegram_chat_id: Optional[str] = None
    telegram_name: Optional[str] = None

class OrchestratorResult(TypedDict, total=False):
    action: str
    success: bool
    data: Any
    message: str
    follow_up: Optional[str]
    inline_buttons: Optional[list[list[dict[str, Any]]]]
    nextState: Optional[Any]  # Placeholder for BookingState
    nextDraft: Optional[Any]  # Placeholder for DraftBooking

class ResolvedContext(TypedDict):
    tenantId: str
    clientId: Optional[str]
    providerId: Optional[str]
    serviceId: Optional[str]
    date: Optional[str]
    time: Optional[str]

class AvailabilitySlot(TypedDict):
    start: str
    available: bool

class AvailabilityData(TypedDict, total=False):
    is_blocked: bool
    block_reason: Optional[str]
    total_available: int
    slots: list[AvailabilitySlot]

class BookingRow(TypedDict):
    start_time: str
    provider_name: str
    specialty: str
    service_name: str
