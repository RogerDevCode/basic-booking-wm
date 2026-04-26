from __future__ import annotations
from typing import Optional, List, TypedDict, Dict, Any
from pydantic import BaseModel, ConfigDict, Field
from datetime import date

class AgendaRow(TypedDict):
    booking_id: str
    status: str
    start_time: str
    end_time: str
    client_name: str
    client_phone: Optional[str]
    service_name: str

class AgendaInput(BaseModel):
    model_config = ConfigDict(strict=True)
    provider_id: str
    target_date: date

class AgendaBooking(TypedDict):
    booking_id: str
    start_time: str
    end_time: str
    status: str
    service_name: str
    client_name: Optional[str]

class AgendaDay(TypedDict):
    date: str
    is_blocked: bool
    block_reason: Optional[str]
    schedule: List[Dict[str, str]]
    bookings: List[AgendaBooking]

class AgendaResult(TypedDict):
    provider_id: str
    provider_name: str
    date_from: str
    date_to: str
    days: List[AgendaDay]

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    provider_id: str
    date_from: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    date_to: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    include_client_details: bool = False
