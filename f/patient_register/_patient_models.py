from typing import Optional, TypedDict
from pydantic import BaseModel, ConfigDict, Field, EmailStr
from f.internal._config import DEFAULT_TIMEZONE

class ClientResult(TypedDict):
    client_id: str
    name: str
    email: Optional[str]
    phone: Optional[str]
    telegram_chat_id: Optional[str]
    timezone: str
    created: bool

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    name: str = Field(min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    telegram_chat_id: Optional[str] = None
    timezone: str = DEFAULT_TIMEZONE
    idempotency_key: Optional[str] = None
    provider_id: Optional[str] = None
    client_id: Optional[str] = None
