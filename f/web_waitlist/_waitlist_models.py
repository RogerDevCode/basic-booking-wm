from typing import Optional, List, Literal, TypedDict, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class WaitlistEntry(TypedDict):
    waitlist_id: str
    service_id: str
    preferred_date: Optional[str]
    preferred_start_time: Optional[str]
    status: str
    position: int
    created_at: str

class WaitlistResult(TypedDict):
    entries: List[WaitlistEntry]
    position: Optional[int]
    message: str

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    action: Literal['join', 'leave', 'list', 'check_position']
    user_id: str
    client_id: Optional[str] = None
    service_id: Optional[str] = None
    waitlist_id: Optional[str] = None
    preferred_date: Optional[str] = None
    preferred_start_time: Optional[str] = None
    preferred_end_time: Optional[str] = None
