from __future__ import annotations
from typing import Optional, List, Literal, TypedDict, Dict, Any
from pydantic import BaseModel, ConfigDict, Field
from ..internal._config import DEFAULT_TIMEZONE

class WizardState(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    step: int = Field(default=0, ge=0)
    client_id: str = Field(min_length=1)
    chat_id: str = Field(min_length=1)
    selected_date: Optional[str] = None
    selected_time: Optional[str] = None

class StepView(TypedDict):
    message: str
    reply_keyboard: List[List[str]]
    new_state: WizardState
    force_reply: bool
    reply_placeholder: str

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    action: Literal['start', 'select_date', 'select_time', 'confirm', 'cancel', 'back']
    wizard_state: Optional[Dict[str, object]] = None
    user_input: Optional[str] = None
    provider_id: Optional[str] = None
    service_id: Optional[str] = None
    timezone: str = DEFAULT_TIMEZONE

class WizardResult(TypedDict):
    message: str
    reply_keyboard: List[List[str]]
    force_reply: bool
    reply_placeholder: str
    wizard_state: dict[str, object]
    is_complete: bool
