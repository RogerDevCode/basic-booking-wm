from __future__ import annotations
from typing import Any

async def _main_async(args: dict[str, Any]) -> dict[str, Any]:
    chat_id = args.get("chat_id")
    text = args.get("text") or "Sin texto"
    return {
        "text": f"ECO: {text}",
        "chat_id": chat_id
    }

def main(args: dict[str, Any]) -> dict[str, Any]:
    import asyncio
    return asyncio.run(_main_async(args))
