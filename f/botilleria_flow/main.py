# /// script
# requires-python = ">=3.13"
# dependencies = []
# ///
from __future__ import annotations

from typing import Any, cast

from wmill import task_script, workflow  # type: ignore[attr-defined]

botilleria_webhook: Any = task_script("f/botilleria_webhook/main", timeout=30)  # pyright: ignore[reportUnknownVariableType]
telegram_send: Any = task_script("f/telegram_send/main", timeout=15)  # pyright: ignore[reportUnknownVariableType]


@workflow  # type: ignore[misc]
async def main(
    update_id: int,
    message_chat_id: int,
    message_text: str | None = None,
    message_from_id: int | None = None,
    message_from_username: str | None = None,
    bot_token: str = "",
) -> dict[str, object]:
    """
    Flow: Telegram Webhook → Botilleria Chat → Telegram Send

    1. Recibe webhook de Telegram
    2. Resuelve tenant via bot_token (channel_identifier)
    3. Llama a botilleria_core API con contexto RAG
    4. Envía respuesta por Telegram
    """
    # Step 1: Process webhook through botilleria (tenant resolution + RAG + LLM)
    raw_result = await botilleria_webhook(
        update_id=update_id,
        message_chat_id=message_chat_id,
        message_text=message_text,
        message_from_id=message_from_id,
        message_from_username=message_from_username,
        bot_token=bot_token,
    )
    botilleria_result = cast("dict[str, Any]", raw_result)

    # Step 2: Send response back via Telegram
    await telegram_send(
        mode="send_message",
        chat_id=str(botilleria_result["chat_id"]),
        text=botilleria_result["response"],
        bot_token=bot_token,
    )

    return {
        "status": "completed",
        "session_id": botilleria_result["session_id"],
        "user_id": botilleria_result["user_id"],
        "tenant_slug": botilleria_result.get("tenant_slug"),
    }
