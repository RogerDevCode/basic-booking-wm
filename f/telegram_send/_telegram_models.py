from __future__ import annotations
from typing import List, Optional, Literal, Union, Annotated, Dict
from pydantic import BaseModel, ConfigDict, Field, RootModel

# ============================================================================
# TELEGRAM SEND — Data Models (v1)
# ============================================================================

class InlineButton(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    text: str = Field(min_length=1)
    callback_data: str = Field(max_length=64)

class BaseTelegramInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    chat_id: str = Field(min_length=1)
    parse_mode: Optional[Literal['Markdown', 'HTML']] = None

class SendMessageInput(BaseTelegramInput):
    mode: Literal['send_message'] = 'send_message'
    text: str = Field(min_length=1)
    inline_buttons: Optional[List[object]] = Field(default_factory=list)
    message_id: Optional[int] = None

class EditMessageInput(BaseTelegramInput):
    mode: Literal['edit_message'] = 'edit_message'
    message_id: int
    text: str = Field(min_length=1)
    inline_buttons: Optional[List[object]] = Field(default_factory=list)

class DeleteMessageInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")
    mode: Literal['delete_message'] = 'delete_message'
    chat_id: str = Field(min_length=1)
    message_id: int
    # Optional fields for compatibility
    text: Optional[str] = None
    parse_mode: Optional[str] = None
    inline_buttons: Optional[List[object]] = None

class AnswerCallbackInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")
    mode: Literal['answer_callback'] = 'answer_callback'
    callback_query_id: str = Field(min_length=1)
    callback_alert: Optional[str] = None
    # Compatibility fields
    chat_id: Optional[str] = None
    text: Optional[str] = None
    parse_mode: Optional[str] = None
    inline_buttons: Optional[List[object]] = None
    message_id: Optional[int] = None

TelegramInput = Annotated[
    Union[
        SendMessageInput,
        EditMessageInput,
        DeleteMessageInput,
        AnswerCallbackInput
    ],
    Field(discriminator='mode')
]

class TelegramInputRoot(RootModel[TelegramInput]):
    root: TelegramInput

class TelegramResponseResult(BaseModel):
    message_id: Optional[int] = None

class TelegramResponse(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")
    ok: bool
    result: Optional[TelegramResponseResult] = None
    description: Optional[str] = None
    error_code: Optional[int] = None

class TelegramSendData(BaseModel):
    sent: bool
    message_id: Optional[int] = None
    chat_id: Optional[str] = None
    mode: str
