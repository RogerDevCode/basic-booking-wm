from typing import Any
from typing import Optional, List, Literal, TypedDict, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class ReminderPrefs(TypedDict):
    telegram_24h: bool
    gmail_24h: bool
    telegram_2h: bool
    telegram_30min: bool

class ReminderConfigResult(TypedDict):
    message: str
    reply_keyboard: Optional[List[List[str]]]
    preferences: ReminderPrefs

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    action: Literal['show', 'toggle_channel', 'toggle_window', 'deactivate_all', 'activate_all', 'back']
    client_id: str
    channel: Optional[str] = None
    window: Optional[str] = None
