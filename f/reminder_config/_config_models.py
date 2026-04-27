from __future__ import annotations

from typing import Literal, TypedDict

from pydantic import BaseModel, ConfigDict


class ReminderPrefs(TypedDict):
    telegram_24h: bool
    gmail_24h: bool
    telegram_2h: bool
    telegram_30min: bool


class ReminderConfigResult(TypedDict):
    message: str
    reply_keyboard: list[list[str]] | None
    preferences: ReminderPrefs


class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    action: Literal["show", "toggle_channel", "toggle_window", "deactivate_all", "activate_all", "back"]
    client_id: str
    channel: str | None = None
    window: str | None = None
