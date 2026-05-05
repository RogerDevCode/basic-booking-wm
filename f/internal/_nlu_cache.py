import json
import os
from typing import Any

import asyncpg
import redis

# Global memory cache (fallback for fast sync access if needed)
_NLU_CACHE: dict[str, Any] = {}

def get_redis_client() -> redis.Redis:
    redis_url = os.getenv("REDIS_URL") or "redis://redis:6379"
    return redis.from_url(redis_url, decode_responses=True)

async def load_nlu_rules_to_redis() -> None:
    """Loads NLU rules from Postgres to Redis."""
    db_url = os.getenv("DATABASE_URL") or "postgresql://postgres:postgres@localhost:5432/booking_db"
    conn = await asyncpg.connect(db_url)
    try:
        rows = await conn.fetch("SELECT rule_key, threshold_value, keywords FROM nlu_rules")
        r = get_redis_client()
        pipeline = r.pipeline()
        for row in rows:
            key = f"nlu_rule:{row['rule_key']}"
            if row['keywords'] is not None:
                val = row['keywords']
                if isinstance(val, str):
                    pipeline.set(key, val)
                else:
                    pipeline.set(key, json.dumps(val))
            elif row['threshold_value'] is not None:
                pipeline.set(key, str(row['threshold_value']))
        pipeline.execute()
    finally:
        await conn.close()

async def ensure_nlu_cache() -> None:
    """Ensures the global memory cache is populated."""
    global _NLU_CACHE
    if _NLU_CACHE:
        return

    # Try loading from Redis first
    r = get_redis_client()
    keys = r.keys("nlu_rule:*")
    
    if not keys:
        # Load from DB to Redis
        await load_nlu_rules_to_redis()
        keys = r.keys("nlu_rule:*")

    if not keys:
        return

    # Fetch all from Redis
    values = r.mget(keys)
    for k, v in zip(keys, values):
        if not v:
            continue
        key_name = k.replace("nlu_rule:", "")
        try:
            _NLU_CACHE[key_name] = json.loads(v)
        except json.JSONDecodeError:
            try:
                _NLU_CACHE[key_name] = float(v)
            except ValueError:
                _NLU_CACHE[key_name] = v

def get_nlu_rule(rule_key: str, default: Any = None) -> Any:
    """Gets an NLU rule from the memory cache synchronously."""
    return _NLU_CACHE.get(rule_key, default)
