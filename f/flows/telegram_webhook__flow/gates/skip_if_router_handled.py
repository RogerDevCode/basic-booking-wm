from __future__ import annotations

from typing import Any


async def _main_async(args: dict[str, Any]) -> dict[str, bool]:
    # Logic from flow.json: results.telegram_router.data?.forward_to_ai
    # Wait, the logic in flow.json was actually in skip_if.
    # The script itself just returns [null, {skip: true}] or similar.
    return {"skip": True}


def main(args: dict[str, Any]) -> dict[str, bool]:
    import asyncio

    return asyncio.run(_main_async(args))
