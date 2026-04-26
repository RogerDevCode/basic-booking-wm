from typing import Any
from typing import Optional, List, Literal, TypedDict, Dict, Any
from pydantic import BaseModel, ConfigDict, Field, EmailStr

class ProfileResult(TypedDict):
    client_id: str
    name: str
    email: Optional[str]
    phone: Optional[str]
    telegram_chat_id: Optional[str]
    timezone: str
    gcal_calendar_id: Optional[str]

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    user_id: str
    action: Literal['get', 'update'] = 'get'
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    timezone: Optional[str] = None
