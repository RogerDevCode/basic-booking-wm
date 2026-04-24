from typing import Optional, List, Literal, Dict, Any, TypedDict
from pydantic import BaseModel, ConfigDict, Field

class DLQEntry(TypedDict):
    dlq_id: int
    booking_id: Optional[str]
    provider_id: Optional[str]
    service_id: Optional[str]
    failure_reason: str
    last_error_message: str
    last_error_stack: Optional[str]
    original_payload: Dict[str, Any]
    idempotency_key: str
    status: Literal['pending', 'resolved', 'discarded']
    created_at: str
    updated_at: str
    resolved_at: Optional[str]
    resolved_by: Optional[str]
    resolution_notes: Optional[str]

class DLQListResult(TypedDict):
    entries: List[DLQEntry]
    total: int

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    action: Literal['list', 'retry', 'resolve', 'discard', 'status']
    dlq_id: Optional[int] = None
    status_filter: Optional[str] = None
    resolution_notes: Optional[str] = None
    resolved_by: Optional[str] = None
    max_retries: int = Field(default=10, ge=1, le=20)
