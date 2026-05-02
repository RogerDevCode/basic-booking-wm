# /// script
# requires-python = ">=3.13"
# dependencies = []
# ///
from __future__ import annotations

from typing import Any


async def _main_async(args: dict[str, Any]) -> dict[str, Any]:
    chat_id = args.get("chat_id")
    text = args.get("text") or "Sin texto"
    state = args.get("state") or {}

    # Extract counter from state or initialize to 0
    pending_data = state.get("pending_data") or {}
    count = pending_data.get("echo_count", 0) + 1

    return {"text": f"ECO #{count}: {text}", "chat_id": chat_id, "new_count": count}


def main(args: dict[str, Any]) -> dict[str, Any]:
    import asyncio

    return asyncio.run(_main_async(args))
