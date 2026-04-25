import asyncio
import wmill # type: ignore
from f.internal._db_client import create_db_client

async def _main():
    conn = await create_db_client()
    try:
        print("--- ALL TABLES ---")
        rows = await conn.fetch("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        """)
        for r in rows:
            print(f"Table: {r['table_name']}")
    finally:
        await conn.close()

def main():
    asyncio.run(_main())
