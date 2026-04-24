from typing import Optional, List, TypedDict
from pydantic import BaseModel, ConfigDict, Field
from f.internal.scheduling_engine import TimeSlot

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    tenant_id: str
    provider_id: str
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    service_id: Optional[str] = None
    duration_minutes: Optional[int] = Field(None, ge=5, le=480)
    buffer_minutes: Optional[int] = Field(None, ge=0, le=120)

class AvailabilityResult(TypedDict):
    provider_id: str
    provider_name: str
    date: str
    timezone: str
    slots: List[TimeSlot]
    total_available: int
    total_booked: int
    is_blocked: bool
    block_reason: Optional[str]

class ProviderRow(TypedDict):
    provider_id: str
    name: str
    timezone: str
