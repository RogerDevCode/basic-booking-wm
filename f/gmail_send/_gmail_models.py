from typing import List, Optional, Literal, Dict, Any, TypedDict
from pydantic import BaseModel, ConfigDict, EmailStr, Field

class ActionLink(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    text: str
    url: str
    style: Literal['primary', 'secondary', 'danger'] = 'primary'

class GmailSendData(TypedDict):
    sent: bool
    message_id: Optional[str]
    recipient_email: str
    message_type: str
    subject: str

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    recipient_email: EmailStr
    message_type: Literal[
        'booking_created',
        'booking_confirmed',
        'booking_cancelled',
        'booking_rescheduled',
        'reminder_24h',
        'reminder_2h',
        'reminder_30min',
        'no_show',
        'provider_schedule_change',
        'custom'
    ]
    booking_details: Dict[str, Any] = Field(default_factory=dict)
    action_links: List[ActionLink] = Field(default_factory=list)
