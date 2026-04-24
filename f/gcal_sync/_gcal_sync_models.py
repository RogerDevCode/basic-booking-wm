from typing import Optional, List, Literal, TypedDict
from pydantic import BaseModel, ConfigDict, Field
from f.internal.gcal_utils import BookingEventData

class GCalSyncResult(TypedDict):
    booking_id: str
    provider_event_id: Optional[str]
    client_event_id: Optional[str]
    sync_status: Literal['synced', 'partial', 'pending']
    retry_count: int
    errors: List[str]

class BookingDetails(BookingEventData):
    provider_id: str
    gcal_provider_event_id: Optional[str]
    gcal_client_event_id: Optional[str]
    provider_calendar_id: Optional[str]
    provider_gcal_access_token: Optional[str]
    provider_gcal_refresh_token: Optional[str]
    provider_gcal_client_id: Optional[str]
    provider_gcal_client_secret: Optional[str]
    client_calendar_id: Optional[str]

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    booking_id: str
    action: Literal['create', 'update', 'delete'] = 'create'
    max_retries: int = Field(default=3, ge=1, le=5)
    tenant_id: str
