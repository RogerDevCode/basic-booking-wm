from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class RouterInput(BaseModel):
    model_config = ConfigDict(strict=True)

    chat_id: str
    user_input: str
    state: dict[str, Any] | None = None


class RouterResult(BaseModel):
    model_config = ConfigDict(strict=True)
    handled: bool
    response_text: str | None = None
    nextState: dict[str, Any] | None = None
    nextDraft: dict[str, Any] | None = None
    inline_buttons: list[dict[str, Any]] | None = None
