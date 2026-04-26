from __future__ import annotations
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict, Field

class ConversationUpdateInput(BaseModel):
    model_config = ConfigDict(strict=True)
    
    chat_id: str
    active_flow: Optional[str] = None
    flow_step: Optional[int] = None
    pending_data: Optional[dict[str, Any]] = None
    booking_state: Optional[dict[str, Any]] = None
    booking_draft: Optional[dict[str, Any]] = None
    message_id: Optional[int] = None
    clear: bool = False

class ConversationUpdateResult(BaseModel):
    model_config = ConfigDict(strict=True)
    success: bool
    chat_id: str
