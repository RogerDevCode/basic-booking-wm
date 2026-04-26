from __future__ import annotations
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class InlineButton(BaseModel):
    model_config = ConfigDict(strict=True)
    text: str
    callback_data: str

class MenuInput(BaseModel):
    model_config = ConfigDict(strict=True)
    action: str
    chat_id: str
    user_input: Optional[str] = None

class MenuResponse(BaseModel):
    model_config = ConfigDict(strict=True)
    handled: bool
    response_text: str
    inline_buttons: List[List[Dict[str, str]]] = Field(default_factory=list)

class InputSchema(MenuInput): pass
class MenuResult(MenuResponse): pass
