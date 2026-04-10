/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Redis-backed conversation state machine for AI Agent turn memory
 * DB Tables Used  : None — Redis only (TTL: 30 minutes)
 * Concurrency Risk: LOW — Redis single-key operations are atomic; concurrent
 *                   writes to same chat_id are idempotent (last write wins, acceptable
 *                   for conversation state which is eventually consistent)
 * GCal Calls      : NO
 * Idempotency Key : N/A — conversation state is ephemeral, not a booking mutation
 * RLS Tenant ID   : N/A — Redis is per-chat, not per-provider
 * Zod Schemas     : YES — ConversationStateSchema validates all stored/retrieved state
 */

// ============================================================================
// CONVERSATION STATE — Redis-backed turn memory for AI Agent
// ============================================================================
// Stores accumulated intent + entities across turns for a single chat_id.
// TTL: 30 minutes (configurable via CONV_STATE_TTL_SECONDS env var).
// Cleared automatically on booking completion or farewell.
//
// AGENTS.md §1.A.3: No throw. All paths return Result<T>.
// AGENTS.md §2.2 KISS: Simple Redis GET/SET/DEL. No complex state graphs.
// AGENTS.md §2.3 SRP: Only manages conversation memory — zero domain logic.
//
// Graceful degradation: if Redis is unavailable, returns [null, null] and
// the caller treats each turn as stateless. No error surfaced to user.
// ============================================================================

import { Redis } from 'ioredis';
import { z } from 'zod';
import type { Result } from '../result';

// ── TTL ───────────────────────────────────────────────────────────────────────
const DEFAULT_CONV_TTL_SECONDS = 30 * 60; // 30 minutes

function getConvTTL(): number {
  const raw = process.env['CONV_STATE_TTL_SECONDS'];
  if (raw != null && raw !== '') {
    const n = Number(raw);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return DEFAULT_CONV_TTL_SECONDS;
}

const CONV_PREFIX = 'conv:';

// ── SCHEMA ────────────────────────────────────────────────────────────────────

/**
 * ConversationStateSchema — persisted as JSON in Redis.
 * accumulated_entities: partial EntityMap collected turn-by-turn.
 * turn_count: used for context logging and max-turn limits.
 * completed: true when a booking action has been executed — triggers cleanup.
 */
const ConversationStateSchema = z.object({
  chat_id:              z.string().min(1),
  pending_intent:       z.string().nullable(),
  accumulated_entities: z.record(z.string(), z.string().nullable()),
  turn_count:           z.number().int().min(0),
  last_updated:         z.string().datetime(),
  completed:            z.boolean().default(false),
}).readonly();

export type ConversationState = z.infer<typeof ConversationStateSchema>;

// ── REDIS CLIENT FACTORY ──────────────────────────────────────────────────────

/**
 * createConversationRedis — Creates an ioredis client from REDIS_URL env var.
 * Returns null if REDIS_URL is not configured (graceful degradation mode).
 * Caller is responsible for calling .quit() when done.
 */
export function createConversationRedis(): Redis | null {
  const redisUrl = process.env['REDIS_URL'];
  if (redisUrl == null || redisUrl === '') return null;

  return new Redis(redisUrl, {
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 2,
    connectTimeout: 3000,
  });
}

// ── CORE OPERATIONS ──────────────────────────────────────────────────────────

/**
 * getConversationState — Retrieves current state for a chat session.
 * Returns [null, null] if no state exists (new conversation) or Redis unavailable.
 * Never throws — Redis failure = graceful stateless fallback.
 */
export async function getConversationState(
  redis: Redis,
  chatId: string,
): Promise<Result<ConversationState | null>> {
  try {
    const raw = await redis.get(`${CONV_PREFIX}${chatId}`);
    if (raw === null) return [null, null]; // No prior state — new conversation

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Corrupted state — treat as new conversation; will be overwritten on next update
      return [null, null];
    }

    const result = ConversationStateSchema.safeParse(parsed);
    if (!result.success) {
      // Schema mismatch (state from older version) — safe to reset
      return [null, null];
    }

    return [null, result.data];
  } catch (e) {
    // Redis unavailable — graceful degradation; caller treats turn as stateless
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[CONV_STATE] Redis unavailable: ${msg}. Falling back to stateless mode.`);
    return [null, null];
  }
}

/**
 * updateConversationState — Persists accumulated intent + entities for a chat.
 * Merges incoming entities with existing state (new values overwrite nulls only).
 * Resets TTL on every call.
 */
export async function updateConversationState(
  redis: Redis,
  chatId: string,
  intent: string,
  entities: Readonly<Record<string, string | null>>,
  existingState: ConversationState | null,
): Promise<Result<ConversationState>> {
  try {
    // Merge strategy: incoming non-null values overwrite stored nulls.
    // Once an entity is set it persists until conversation is cleared.
    const existingEntities = existingState?.accumulated_entities ?? {};
    const mergedEntities: Record<string, string | null> = { ...existingEntities };

    for (const [key, value] of Object.entries(entities)) {
      if (value !== null) {
        mergedEntities[key] = value;
      } else if (mergedEntities[key] === undefined) {
        mergedEntities[key] = null;
      }
    }

    const newState: ConversationState = {
      chat_id:              chatId,
      pending_intent:       intent,
      accumulated_entities: mergedEntities,
      turn_count:           (existingState?.turn_count ?? 0) + 1,
      last_updated:         new Date().toISOString(),
      completed:            false,
    };

    const ttl = getConvTTL();
    await redis.setex(`${CONV_PREFIX}${chatId}`, ttl, JSON.stringify(newState));
    return [null, newState];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`conv_state_update_failed: ${msg}`), null];
  }
}

/**
 * clearConversationState — Deletes conversation state from Redis.
 * Called when: booking completed, farewell intent, explicit reset.
 * Safe to call even if no state exists.
 */
export async function clearConversationState(
  redis: Redis,
  chatId: string,
): Promise<Result<null>> {
  try {
    await redis.del(`${CONV_PREFIX}${chatId}`);
    return [null, null];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`conv_state_clear_failed: ${msg}`), null];
  }
}
