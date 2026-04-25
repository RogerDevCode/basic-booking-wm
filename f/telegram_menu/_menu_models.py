from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict

class InlineButton(BaseModel):
    text: str
    callback_data: str

class MenuInput(BaseModel):
    action: str
    chat_id: str
    user_input: Optional[str] = None

class MenuResponse(BaseModel):
    handled: bool
    response_text: str
    inline_buttons: List[List[Dict[str, Any]]] = Field(default_factory=list)

class InputSchema(MenuInput): pass
class MenuResult(MenuResponse): pass
