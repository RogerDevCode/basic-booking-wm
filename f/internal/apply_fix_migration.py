import asyncio

from f.internal._db_client import create_db_client


async def _main() -> None:
    conn = await create_db_client()
    try:
        print("--- APPLYING FIX MIGRATION ---")
        sql = """
            ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
            ALTER TABLE clients ADD COLUMN IF NOT EXISTS gcal_calendar_id TEXT;
            ALTER TABLE clients ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Santiago';
            CREATE INDEX IF NOT EXISTS idx_clients_telegram ON clients(telegram_chat_id);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
            CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_chat_id);
        """
        await conn.execute(sql)
        print("MIGRATION APPLIED SUCCESSFULLY!")
    finally:
        await conn.close()


def main() -> None:
    asyncio.run(_main())
