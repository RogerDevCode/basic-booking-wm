from typing import Any
from typing import Optional, Literal, TypedDict, List, Any
from pydantic import BaseModel, ConfigDict, Field, EmailStr
from f.internal._config import DEFAULT_TIMEZONE

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    action: Literal[
        'create_provider', 'update_provider', 'list_providers',
        'create_service', 'update_service', 'list_services',
        'set_schedule', 'remove_schedule',
        'set_override', 'remove_override',
    ]
    provider_id: Optional[str] = None
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    specialty: Optional[str] = Field(None, max_length=100)
    timezone: Optional[str] = DEFAULT_TIMEZONE
    is_active: Optional[bool] = None
    service_id: Optional[str] = None
    service_name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    duration_minutes: Optional[int] = Field(None, ge=5, le=480)
    buffer_minutes: Optional[int] = Field(None, ge=0, le=120)
    price_cents: Optional[int] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    day_of_week: Optional[int] = Field(None, ge=0, le=6)
    start_time: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    end_time: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    override_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    is_blocked: Optional[bool] = None
    override_reason: Optional[str] = None
