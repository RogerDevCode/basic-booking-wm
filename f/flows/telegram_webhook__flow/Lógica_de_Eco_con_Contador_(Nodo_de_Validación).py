from __future__ import annotations

from typing import Any


def main(args: dict[str, Any]) -> dict[str, Any]:
    chat_id = str(args.get("chat_id", ""))
    text = str(args.get("text", "Sin texto"))
    state = args.get("state")

    # Extract counter safely
    count = 0
    if isinstance(state, dict):
        pending_data = state.get("pending_data")
        if isinstance(pending_data, dict):
            count = int(pending_data.get("echo_count", 0))

    count += 1

    return {"text": f"ECO #{count}: {text}", "chat_id": chat_id, "new_count": count}
