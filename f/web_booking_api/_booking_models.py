from typing import Optional, List, Literal, TypedDict, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class BookingResult(TypedDict):
    booking_id: str
    status: str
    message: str

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    action: Literal['crear', 'cancelar', 'reagendar']
    user_id: str
    booking_id: Optional[str] = None
    provider_id: Optional[str] = None
    service_id: Optional[str] = None
    start_time: Optional[str] = None
    cancellation_reason: Optional[str] = Field(None, max_length=500)
    idempotency_key: Optional[str] = Field(None, min_length=1, max_length=255)
