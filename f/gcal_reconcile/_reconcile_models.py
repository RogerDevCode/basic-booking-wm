from __future__ import annotations
from typing import List, Optional, TypedDict
from pydantic import BaseModel, ConfigDict, Field

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    dry_run: bool = False
    max_retries: int = Field(default=3, ge=1, le=5)
    batch_size: int = Field(default=50, ge=1, le=100)
    max_gcal_retries: int = Field(default=10, ge=1, le=20)

class ReconcileResult(TypedDict):
    processed: int
    synced: int
    partial: int
    failed: int
    skipped: int
    errors: List[str]

class BookingRow(TypedDict):
    booking_id: str
    status: str
    start_time: str
    end_time: str
    gcal_provider_event_id: Optional[str]
    gcal_client_event_id: Optional[str]
    gcal_retry_count: int
    provider_name: str
    provider_calendar_id: Optional[str]
    client_name: str
    client_calendar_id: Optional[str]
    service_name: str

class SyncResult(TypedDict):
    providerEventId: Optional[str]
    clientEventId: Optional[str]
    errors: List[str]
