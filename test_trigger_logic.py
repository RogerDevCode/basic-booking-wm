from typing import Any

from pydantic import BaseModel


class TelegramMessage(BaseModel):
    message_id: int
    text: str | None = None
    chat: dict[str, Any]


class TelegramUpdate(BaseModel):
    update_id: int
    message: TelegramMessage | None = None


def trigger_logic(webhook_payload: dict[str, Any]) -> dict[str, Any]:
    try:
        update = TelegramUpdate.model_validate(webhook_payload)
        return update.model_dump()
    except Exception as e:
        return {"error": str(e)}


payload = {
    "update_id": 999999999,
    "message": {
        "message_id": 1,
        "chat": {"id": "12345", "type": "private"},
        "text": "/start",
    },
}
print(trigger_logic(payload))
