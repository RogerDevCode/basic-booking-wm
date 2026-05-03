from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class TriggerOutput(BaseModel):
    model_config = ConfigDict(strict=True)
    chat_id: str
    text: str
    username: str
    first_name: str
    last_name: str | None = None
    update_id: int | None = None
    callback_data: str | None = None
    callback_query_id: str | None = None
    callback_message_id: int | None = None


async def _main_async(webhook_payload: dict[str, Any]) -> dict[str, Any]:
    # Extract the actual Telegram payload from Windmill's wrapper if present
    # Windmill raw webhooks often place the payload in 'body' or 'data'
    payload = webhook_payload
    if "body" in webhook_payload and isinstance(webhook_payload["body"], dict):
        payload = webhook_payload["body"]
    elif "message" not in webhook_payload and "callback_query" not in webhook_payload:
        # Fallback: maybe it's under another key?
        for key in ["webhook_payload", "data", "event"]:
            if key in webhook_payload and isinstance(webhook_payload[key], dict):
                payload = webhook_payload[key]
                break

    update_id_raw = payload.get("update_id")
    update_id = int(update_id_raw) if isinstance(update_id_raw, int) else None

    message = payload.get("message", {})
    callback_query = payload.get("callback_query", {})

    chat_id = ""
    text = ""
    username = "unknown"
    callback_data = None
    callback_query_id = None
    callback_message_id = None

    first_name = "Usuario"
    last_name: str | None = None

    if message:
        from_data = message.get("from", {})
        chat_id = str(message.get("chat", {}).get("id", ""))
        text = message.get("text", "")
        username = from_data.get("username", "unknown")
        first_name = from_data.get("first_name", "Usuario") or "Usuario"
        last_name = from_data.get("last_name") or None
    elif callback_query:
        from_data = callback_query.get("from", {})
        msg = callback_query.get("message", {})
        chat_id = str(msg.get("chat", {}).get("id", ""))
        callback_data = callback_query.get("data")
        callback_query_id = callback_query.get("id")
        callback_message_id = msg.get("message_id")
        username = from_data.get("username", "unknown")
        first_name = from_data.get("first_name", "Usuario") or "Usuario"
        last_name = from_data.get("last_name") or None

    return {
        "chat_id": chat_id,
        "text": text,
        "username": username,
        "first_name": first_name,
        "last_name": last_name,
        "update_id": update_id,
        "callback_data": callback_data,
        "callback_query_id": callback_query_id,
        "callback_message_id": callback_message_id,
    }


def main(webhook_payload: dict[str, Any]) -> dict[str, Any]:
    import asyncio

    return asyncio.run(_main_async(webhook_payload))
