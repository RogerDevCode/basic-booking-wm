from typing import Optional, List, Literal, TypedDict, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class AgendaItem(TypedDict):
    booking_id: str
    client_name: str
    client_email: Optional[str]
    service_name: str
    start_time: str
    end_time: str
    status: str

class ProviderStats(TypedDict):
    today_total: int
    month_total: int
    month_completed: int
    month_no_show: int
    attendance_rate: str

class DashboardResult(TypedDict):
    provider_id: str
    provider_name: str
    specialty: str
    agenda: List[AgendaItem]
    stats: ProviderStats

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    provider_user_id: str
    date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
