from __future__ import annotations

import asyncio
import os

import asyncpg


async def run() -> None:
    db_url = os.getenv("DATABASE_URL") or "postgresql://postgres:postgres@localhost:5432/booking_db"
    conn = await asyncpg.connect(db_url)
    await conn.execute("TRUNCATE TABLE nlu_rules")
    await conn.close()


asyncio.run(run())
