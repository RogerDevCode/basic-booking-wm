# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "asyncpg>=0.30.0",
#   "redis>=7.4.0"
# ]
# ///
from __future__ import annotations

import asyncio
import json

from f.internal._db_client import create_db_client
from f.internal._redis_client import create_redis_client


async def main() -> None:
    correct_value = "📱 *Menú Principal*\n\n1️⃣ Agendar hora\n2️⃣ Mis horas\n3️⃣ Recordatorios\n4️⃣ Información\n5️⃣ Mis datos"

    # 1. Update PostgreSQL Neon DB
    print("Connecting to database...")
    db = await create_db_client()
    try:
        # Check current value
        row = await db.fetchrow("SELECT rule_key, keywords FROM nlu_rules WHERE rule_key = 'msg_main_menu'")
        if row:
            print(f"Current DB value: {row['keywords']!r}")
        else:
            print("Row not found in DB!")

        # Update/Insert row
        await db.execute(
            """
            INSERT INTO nlu_rules (rule_key, keywords, description)
            VALUES ($1, $2::jsonb, $3)
            ON CONFLICT (rule_key) 
            DO UPDATE SET keywords = EXCLUDED.keywords
            """,
            "msg_main_menu",
            json.dumps(correct_value),
            "Main menu options message",
        )
        print("Successfully updated database!")
    finally:
        await db.close()

    # 2. Update Redis
    print("Connecting to Redis...")
    # Explicitly use localhost since we are running from the host machine
    redis_client = await create_redis_client("redis://localhost:6379")
    try:
        redis_key = "booking:nlu_rule:msg_main_menu"
        current_redis = await redis_client.get(redis_key)
        print(f"Current Redis value: {current_redis!r}")

        # Set new value
        await redis_client.set(redis_key, json.dumps(correct_value))
        print("Successfully updated Redis!")
    finally:
        await redis_client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
