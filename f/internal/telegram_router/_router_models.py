from __future__ import annotations
from typing import Optional, Any, List
from pydantic import BaseModel, ConfigDict, Field

class RouterInput(BaseModel):
    model_config = ConfigDict(strict=True)
    
    chat_id: str
    user_input: str
    state: Optional[dict[str, Any]] = None

class RouterResult(BaseModel):
    model_config = ConfigDict(strict=True)
    handled: bool
    response_text: Optional[str] = None
    nextState: Optional[dict[str, Any]] = None
    nextDraft: Optional[dict[str, Any]] = None
    inline_buttons: Optional[List[dict[str, Any]]] = None
