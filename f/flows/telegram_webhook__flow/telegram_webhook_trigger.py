from __future__ import annotations

import json
import urllib.request
from typing import Any, Literal

type EventKind = Literal["message", "callback", "empty"]
type TextKind = Literal["plain_text", "command_start", "command_other", "callback", "empty"]


def _answer_callback_query(callback_query_id: str, bot_token: str) -> None:
    url = f"https://api.telegram.org/bot{bot_token}/answerCallbackQuery"
    data = json.dumps({"callback_query_id": callback_query_id}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=2)
    except Exception:
        pass  # Non-fatal — best-effort answer


async def _main_async(webhook_payload: dict[str, Any]) -> dict[str, Any]:
    # Extract actual Telegram payload from Windmill's wrapper if present
    payload = webhook_payload
    if "body" in webhook_payload and isinstance(webhook_payload["body"], dict):
        payload = webhook_payload["body"]
    elif "message" not in webhook_payload and "callback_query" not in webhook_payload:
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
    callback_data: str | None = None
    callback_query_id: str | None = None
    callback_message_id: int | None = None
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

    # Answer callback query immediately to dismiss Telegram inline button spinner
    if callback_query_id:
        try:
            import wmill

            bot_token = wmill.get_variable("u/admin/TELEGRAM_BOT_TOKEN")
            if bot_token:
                _answer_callback_query(callback_query_id, str(bot_token))
        except Exception:
            pass  # Non-fatal

    # Inline normalize + classify
    normalized_text = text.strip()
    event_kind: EventKind = "empty"

    if normalized_text:
        event_kind = "message"
    elif callback_data is not None:
        event_kind = "callback"

    text_kind: TextKind = "empty"
    canonical_text = ""
    should_process = False

    if event_kind == "callback":
        # Use callback_data as canonical_text so downstream router receives it
        text_kind = "callback"
        canonical_text = callback_data or ""
        should_process = True
    elif event_kind == "message":
        should_process = True
        canonical_text = normalized_text
        if canonical_text == "/start":
            text_kind = "command_start"
        elif canonical_text.startswith("/"):
            text_kind = "command_other"
        else:
            text_kind = "plain_text"

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
        "event_kind": event_kind,
        "canonical_text": canonical_text,
        "text_kind": text_kind,
        "should_process": should_process,
    }


def main(webhook_payload: dict[str, Any]) -> dict[str, Any]:
    import asyncio

    return asyncio.run(_main_async(webhook_payload))
