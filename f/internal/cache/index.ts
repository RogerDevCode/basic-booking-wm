// ============================================================================
// SEMANTIC CACHE — Redis-backed LLM response cache
// ============================================================================
// Caches identical queries with configurable TTL.
// Uses SHA256 hash of query for cache keys (deterministic, collision-safe).
// Pattern: Errors as values, no throw, strict typing.
// ============================================================================

import Redis from "ioredis";
import { createHash } from "node:crypto";
import type { Result } from '../result';
import type { IntentType } from '../ai_agent/constants';

interface CacheEntry {
  readonly query_hash: string;
  readonly response: string;
  readonly intent: IntentType;
  readonly created_at: string;
  readonly ttl_seconds: number;
}

interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly keys: number;
}

const DEFAULT_TTL = 3600; // 1 hour
const CACHE_PREFIX = "booking:llm_cache:";

// ============================================================================
// HASH UTILITY
// ============================================================================

function hashQuery(text: string): string {
  return createHash("sha256").update(text.toLowerCase().trim()).digest("hex");
}

// ============================================================================
// CLIENT FACTORY
// ============================================================================

function createRedisClient(): Result<Redis> {
  const redisUrl = process.env["REDIS_URL"];
  if (redisUrl == null || redisUrl === "") {
    return [new Error("REDIS_URL not configured"), null];
  }

  try {
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number): number | null {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      },
      connectTimeout: 5000,
      commandTimeout: 3000,
    });

    return [null, redis];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function cacheGet(
  text: string,
): Promise<Result<CacheEntry | null>> {
  const [clientErr, redis] = createRedisClient();
  if (clientErr != null || redis == null) return [clientErr ?? new Error("Redis client unavailable"), null];

  try {
    const key = `${CACHE_PREFIX}${hashQuery(text)}`;
    const data = await redis.get(key);

    if (data == null) {
      return [null, null];
    }

    const entry = JSON.parse(data) as CacheEntry;
    return [null, entry];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  } finally {
    void redis.quit();
  }
}

export async function cacheSet(
  text: string,
  response: string,
  intent: IntentType,
  ttlSeconds: number = DEFAULT_TTL,
): Promise<Result<null>> {
  const [clientErr, redis] = createRedisClient();
  if (clientErr != null || redis == null) return [clientErr ?? new Error("Redis client unavailable"), null];

  try {
    const key = `${CACHE_PREFIX}${hashQuery(text)}`;
    const entry: CacheEntry = {
      query_hash: hashQuery(text),
      response,
      intent,
      created_at: new Date().toISOString(),
      ttl_seconds: ttlSeconds,
    };

    await redis.set(key, JSON.stringify(entry), "EX", ttlSeconds);
    return [null, null];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  } finally {
    void redis.quit();
  }
}

export async function cacheInvalidate(text: string): Promise<Result<null>> {
  const [clientErr, redis] = createRedisClient();
  if (clientErr != null || redis == null) return [clientErr ?? new Error("Redis client unavailable"), null];

  try {
    const key = `${CACHE_PREFIX}${hashQuery(text)}`;
    await redis.del(key);
    return [null, null];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  } finally {
    void redis.quit();
  }
}

export async function cacheStats(): Promise<Result<CacheStats>> {
  const [clientErr, redis] = createRedisClient();
  if (clientErr != null || redis == null) return [clientErr ?? new Error("Redis client unavailable"), null];

  try {
    const keys = await redis.keys(`${CACHE_PREFIX}*`);
    return [null, { hits: 0, misses: 0, keys: keys.length }];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  } finally {
    void redis.quit();
  }
}

export async function cacheClear(): Promise<Result<number>> {
  const [clientErr, redis] = createRedisClient();
  if (clientErr != null || redis == null) return [clientErr ?? new Error("Redis client unavailable"), null];

  try {
    const keys = await redis.keys(`${CACHE_PREFIX}*`);
    if (keys.length === 0) return [null, 0];

    const deleted = await redis.del(keys);
    return [null, deleted];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  } finally {
    void redis.quit();
  }
}
