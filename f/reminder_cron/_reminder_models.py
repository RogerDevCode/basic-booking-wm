from typing import Any
from typing import Optional, List, Literal, Dict, Any, TypedDict
from pydantic import BaseModel, ConfigDict, Field
from f.internal._config import DEFAULT_TIMEZONE

class ReminderPrefs(TypedDict, total=False):
    telegram_24h: bool
    telegram_2h: bool
    telegram_30min: bool
    email_24h: bool
    email_2h: bool
    email_30min: bool

class BookingRecord(TypedDict):
    booking_id: str
    client_id: str
    provider_id: str
    start_time: Any
    end_time: Any
    status: str
    reminder_24h_sent: bool
    reminder_2h_sent: bool
    reminder_30min_sent: bool
    client_telegram_chat_id: Optional[str]
    client_email: Optional[str]
    client_name: Optional[str]
    provider_name: Optional[str]
    service_name: Optional[str]
    reminder_preferences: Optional[ReminderPrefs]

class CronResult(TypedDict):
    reminders_24h_sent: int
    reminders_2h_sent: int
    reminders_30min_sent: int
    errors: int
    dry_run: bool
    processed_bookings: List[str]

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    dry_run: bool = False
    timezone: str = DEFAULT_TIMEZONE

ReminderWindow = Literal['24h', '2h', '30min']
