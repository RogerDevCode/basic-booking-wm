from typing import Any
from typing import Optional, List, Literal, Union, Dict, Any, Annotated
from pydantic import BaseModel, ConfigDict, Field

# ============================================================================
# TELEGRAM GATEWAY — Data Models (v1)
# ============================================================================

class TelegramUser(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")
    id: int
    is_bot: Optional[bool] = None
    first_name: str = "Usuario"
    last_name: Optional[str] = None
    username: Optional[str] = None

class TelegramChat(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")
    id: int
    type: Literal['private', 'group', 'supergroup', 'channel']

class TelegramMessage(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")
    message_id: int
    from_user: Optional[TelegramUser] = Field(None, alias="from")
    chat: TelegramChat
    date: int
    text: Optional[str] = None

class TelegramCallback(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")
    id: str
    from_user: TelegramUser = Field(alias="from")
    message: Optional[TelegramMessage] = None
    data: str

class TelegramUpdate(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")
    update_id: int
    message: Optional[TelegramMessage] = None
    callback_query: Optional[TelegramCallback] = None

class SendMessageOptions(BaseModel):
    parse_mode: Optional[Literal['Markdown', 'HTML', 'MarkdownV2']] = 'Markdown'
    reply_markup: Optional[Dict[str, Any]] = None
