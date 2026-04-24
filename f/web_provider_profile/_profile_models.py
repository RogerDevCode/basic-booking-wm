from typing import Optional, List, Literal, TypedDict, Dict, Any
from pydantic import BaseModel, ConfigDict, Field, EmailStr

class ProfileRow(TypedDict):
    id: str
    name: str
    email: str
    honorific_label: Optional[str]
    specialty_name: Optional[str]
    timezone_name: Optional[str]
    phone_app: Optional[str]
    phone_contact: Optional[str]
    telegram_chat_id: Optional[str]
    gcal_calendar_id: Optional[str]
    address_street: Optional[str]
    address_number: Optional[str]
    address_complement: Optional[str]
    address_sector: Optional[str]
    region_name: Optional[str]
    commune_name: Optional[str]
    is_active: bool
    has_password: bool
    last_password_change: Optional[str]

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    action: Literal['get_profile', 'update_profile', 'change_password']
    provider_id: str
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    email: Optional[EmailStr] = None
    phone_app: Optional[str] = Field(None, max_length=20)
    phone_contact: Optional[str] = Field(None, max_length=20)
    telegram_chat_id: Optional[str] = Field(None, max_length=100)
    gcal_calendar_id: Optional[str] = Field(None, max_length=500)
    address_street: Optional[str] = Field(None, max_length=300)
    address_number: Optional[str] = Field(None, max_length=20)
    address_complement: Optional[str] = Field(None, max_length=200)
    address_sector: Optional[str] = Field(None, max_length=200)
    region_id: Optional[int] = None
    commune_id: Optional[int] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None
