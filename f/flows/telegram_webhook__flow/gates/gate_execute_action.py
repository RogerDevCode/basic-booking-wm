from __future__ import annotations

from typing import Any


async def _main_async(args: dict[str, Any]) -> dict[str, bool]:
    return {"skip": True}


def main(args: dict[str, Any]) -> dict[str, bool]:
    import asyncio

    return asyncio.run(_main_async(args))
