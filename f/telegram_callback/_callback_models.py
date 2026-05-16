from __future__ import annotations

from typing import Protocol, Required, TypedDict

from pydantic import BaseModel, ConfigDict, Field


class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")

    callback_query_id: str = Field(min_length=1)
    callback_data: str = Field(min_length=1, max_length=64)
    chat_id: str = Field(min_length=1)
    message_id: str | None = None
    user_id: str | None = None
    client_id: str | None = None


class ActionContext(TypedDict, total=False):
    botToken: Required[str]
    tenantId: Required[str]
    booking_id: Required[str]
    client_id: Required[str | None]
    chat_id: Required[str]
    callback_query_id: Required[str]
    date: str | None
    time: str | None


class ActionResult(TypedDict):
    responseText: str
    followUpText: str | None


class ActionHandler(Protocol):
    async def handle(self, context: ActionContext) -> ActionResult: ...
