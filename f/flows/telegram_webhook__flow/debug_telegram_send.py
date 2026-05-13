# /// script
# requires-python = ">=3.13"
# dependencies = []
# ///
from __future__ import annotations

from typing import Any

# ============================================================================
# ⚠️ TEMPORARY DEBUG NODE — REMOVE BEFORE PRODUCTION DEPLOYMENT
# ============================================================================
# Purpose: Mirror all outgoing Telegram messages to a debug chat for monitoring.
# Captures: chat_id, text, mode, message_id, inline_buttons, handled status.
# To disable: Set skip_if in flow.yaml or remove this node entirely.
# ============================================================================


async def _main_async(args: dict[str, Any]) -> dict[str, bool]:
    """Format debug payload and return it for the flow to send to debug chat."""
    chat_id = args.get("chat_id", "unknown")
    text = args.get("text", "")
    mode = args.get("mode", "send_message")
    message_id = args.get("message_id")
    inline_buttons = args.get("inline_buttons")
    handled = args.get("handled")
    response_text = args.get("response_text", "")

    # Truncate long messages for readability
    text_preview = str(text)[:300] + ("..." if len(str(text)) > 300 else "")

    # Build buttons summary
    buttons_info = "ninguno"
    if inline_buttons:
        try:
            import json

            if isinstance(inline_buttons, str):
                parsed = json.loads(inline_buttons)
            else:
                parsed = inline_buttons
            if isinstance(parsed, list) and parsed:
                total = sum(len(row) if isinstance(row, list) else 1 for row in parsed)
                buttons_info = f"{total} botones"
        except Exception:
            buttons_info = "(error parsing)"

    mode_label = "edit" if mode == "edit_message" else "send"
    handled_label = "Si" if handled else "No"
    msg_id_info = f" | msg_id: {message_id}" if message_id else ""

    debug_text = (
        f"📤 *Telegram Outgoing*\n\n"
        f"🎯 *To:* `{chat_id}`\n"
        f"📝 *Mode:* {mode_label}{msg_id_info}\n"
        f"✅ *Handled:* {handled_label}\n"
        f"🔘 *Buttons:* {buttons_info}\n\n"
        f"📄 *Message:*\n`{text_preview}`"
    )

    return {"debug_text": debug_text, "captured": True}


def main(
    chat_id: str = "unknown",
    text: str = "",
    mode: str = "send_message",
    inline_buttons_json: str | None = None,
    message_id: int | None = None,
    handled: bool | None = None,
    response_text: str = "",
) -> dict[str, Any]:
    import asyncio

    args: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "mode": mode,
        "inline_buttons": inline_buttons_json,
        "message_id": message_id,
        "handled": handled,
        "response_text": response_text,
    }

    return asyncio.run(_main_async(args))
