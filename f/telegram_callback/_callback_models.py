from typing import Optional, Literal, List, TypedDict, Protocol
from pydantic import BaseModel, ConfigDict, Field

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")
    
    callback_query_id: str = Field(min_length=1)
    callback_data: str = Field(min_length=1, max_length=64)
    chat_id: str = Field(min_length=1)
    message_id: Optional[str] = None
    user_id: Optional[str] = None
    client_id: Optional[str] = None

class ActionContext(TypedDict):
    botToken: str
    tenantId: str
    booking_id: str
    client_id: Optional[str]
    chat_id: str
    callback_query_id: str

class ActionResult(TypedDict):
    responseText: str
    followUpText: Optional[str]

class ActionHandler(Protocol):
    async def handle(self, context: ActionContext) -> tuple[Optional[Exception], Optional[ActionResult]]:
        ...
