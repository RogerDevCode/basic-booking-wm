from typing import Optional, TypedDict
from pydantic import BaseModel, ConfigDict, Field

class UserProfileResult(TypedDict):
    user_id: str
    email: Optional[str]
    full_name: str
    role: str
    rut: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    telegram_chat_id: Optional[str]
    timezone: str
    is_active: bool
    profile_complete: bool
    last_login: Optional[str]

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    user_id: str
