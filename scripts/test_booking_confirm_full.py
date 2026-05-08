import asyncio
import os
import json
from f.internal.booking_confirm.main import _main_async

async def test():
    import asyncpg
    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        row = await conn.fetchrow("SELECT provider_id FROM providers LIMIT 1")
        if not row:
            print("No providers found")
            return
        p_id = str(row['provider_id'])
        
        row = await conn.fetchrow("SELECT client_id FROM clients LIMIT 1")
        if not row:
            print("No clients found")
            return
        c_id = str(row['client_id'])
        
        print(f"Testing with provider={p_id}, client={c_id}")
        
        res = await _main_async(
            client_id=c_id,
            provider_id=p_id,
            start_time="2026-05-10T10:00:00Z",
            chat_id="test_chat_123",
            pg_url=os.environ["DATABASE_URL"]
        )
        
        print(f"Result: {json.dumps(res, indent=2)}")
        
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(test())
