from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class TriggerOutput(BaseModel):
    model_config = ConfigDict(strict=True)
    chat_id: str
    text: str
    username: str
    callback_data: str | None = None
    callback_query_id: str | None = None
    callback_message_id: int | None = None


async def main(webhook_payload: dict[str, Any]) -> dict[str, Any]:
    # Logic extracted from flow.json and telegram_gateway
    message = webhook_payload.get("message", {})
    callback_query = webhook_payload.get("callback_query", {})

    chat_id = ""
    text = ""
    username = "unknown"
    callback_data = None
    callback_query_id = None
    callback_message_id = None

    if message:
        chat_id = str(message.get("chat", {}).get("id", ""))
        text = message.get("text", "")
        username = message.get("from", {}).get("username", "unknown")
    elif callback_query:
        msg = callback_query.get("message", {})
        chat_id = str(msg.get("chat", {}).get("id", ""))
        callback_data = callback_query.get("data")
        callback_query_id = callback_query.get("id")
        callback_message_id = msg.get("message_id")
        username = callback_query.get("from", {}).get("username", "unknown")

    return {
        "chat_id": chat_id,
        "text": text,
        "username": username,
        "callback_data": callback_data,
        "callback_query_id": callback_query_id,
        "callback_message_id": callback_message_id,
    }
