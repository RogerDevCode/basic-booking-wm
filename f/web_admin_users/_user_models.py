from typing import Any
from typing import Optional, List, Literal, TypedDict, Dict, Any
from pydantic import BaseModel, ConfigDict, Field, EmailStr

class UserInfo(TypedDict):
    user_id: str
    full_name: str
    email: Optional[str]
    rut: Optional[str]
    phone: Optional[str]
    role: str
    is_active: bool
    telegram_chat_id: Optional[str]
    last_login: Optional[str]
    created_at: str

class UsersListResult(TypedDict):
    users: List[UserInfo]
    total: int

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    admin_user_id: str
    action: Literal['list', 'get', 'update', 'deactivate', 'activate']
    target_user_id: Optional[str] = None
    full_name: Optional[str] = Field(None, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    role: Optional[Literal['admin', 'provider', 'client']] = None
