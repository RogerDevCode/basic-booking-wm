from __future__ import annotations
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict, Field

class ConversationState(BaseModel):
    model_config = ConfigDict(strict=True)
    
    chat_id: str
    active_flow: Optional[str] = None
    flow_step: int = 0
    pending_data: dict[str, Any] = Field(default_factory=dict)
    booking_state: Optional[dict[str, Any]] = None
    booking_draft: Optional[dict[str, Any]] = None
    message_id: Optional[int] = None
    updated_at: str

class ConversationGetResult(BaseModel):
    model_config = ConfigDict(strict=True)
    data: Optional[ConversationState] = None
