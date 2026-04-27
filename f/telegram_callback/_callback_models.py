from __future__ import annotations

from typing import Protocol, TypedDict

from pydantic import BaseModel, ConfigDict, Field


class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")

    callback_query_id: str = Field(min_length=1)
    callback_data: str = Field(min_length=1, max_length=64)
    chat_id: str = Field(min_length=1)
    message_id: str | None = None
    user_id: str | None = None
    client_id: str | None = None


class ActionContext(TypedDict):
    botToken: str
    tenantId: str
    booking_id: str
    client_id: str | None
    chat_id: str
    callback_query_id: str


class ActionResult(TypedDict):
    responseText: str
    followUpText: str | None


class ActionHandler(Protocol):
    async def handle(self, context: ActionContext) -> tuple[Exception | None, ActionResult | None]: ...
