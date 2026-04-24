from typing import Optional, List, Literal, Dict, Any, TypedDict
from pydantic import BaseModel, ConfigDict, Field

class MenuResult(TypedDict):
    success: bool
    data: Optional[Dict[str, Any]]
    error_message: Optional[str]

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    action: Literal['show', 'select_option', 'start']
    chat_id: str = Field(min_length=1)
    user_input: Optional[str] = None
    client_id: Optional[str] = None
