import asyncio
import os
import redis.asyncio as redis

async def run():
    r = redis.from_url("redis://localhost:6379", decode_responses=True)
    await r.delete("nlu_rule:msg_generic")
    print("Deleted nlu_rule:msg_generic from Redis")

if __name__ == "__main__":
    asyncio.run(run())
