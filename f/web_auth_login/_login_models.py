from typing import Optional, TypedDict
from pydantic import BaseModel, ConfigDict, EmailStr, Field

class LoginResult(TypedDict):
    user_id: str
    email: str
    full_name: str
    role: str
    profile_complete: bool

class UserRow(TypedDict):
    user_id: str
    email: str
    full_name: str
    role: str
    password_hash: str
    is_active: bool
    profile_complete: bool

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    email: EmailStr
    password: str = Field(min_length=1)
