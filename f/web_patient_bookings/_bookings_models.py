from typing import Optional, List, Literal, TypedDict, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class BookingInfo(TypedDict):
    booking_id: str
    provider_name: Optional[str]
    provider_specialty: str
    service_name: str
    start_time: str
    end_time: str
    status: str
    cancellation_reason: Optional[str]
    can_cancel: bool
    can_reschedule: bool

class BookingsResult(TypedDict):
    upcoming: List[BookingInfo]
    past: List[BookingInfo]
    total: int

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    client_user_id: str
    status: Literal['all', 'pending', 'confirmed', 'in_service', 'completed', 'cancelled', 'no_show', 'rescheduled'] = 'all'
    limit: int = Field(default=50, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
