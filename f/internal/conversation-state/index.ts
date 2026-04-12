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
 * Unified with f/internal/ai_agent/types.ts ConversationStateSchema.
 *
 * active_flow: current multi-turn flow (e.g., "booking_wizard", "selecting_specialty")
 * flow_step: which step in the flow the user is on (0 = start, 1 = next, etc.)
 * pending_data: partial data collected across turns (specialty_id, date, time, etc.)
 * previous_intent: the intent from the previous turn (for context)
 * last_user_utterance: what the user said last turn (for disambiguation)
 */
const ConversationStateSchema = z.object({
  chat_id:              z.string().min(1),
  previous_intent:      z.string().nullable().catch(null),
  active_flow:          z.enum(['booking_wizard', 'reschedule_flow', 'cancellation_flow', 'reminder_flow', 'selecting_specialty', 'selecting_datetime', 'none']).default('none'),
  flow_step:            z.number().int().min(0).default(0),
  pending_data:         z.record(z.string(), z.string().nullable()).default({}),
  last_user_utterance:  z.string().nullable().catch(null),
  last_updated:         z.string().datetime(),
  completed:            z.boolean().default(false),
}).readonly();

export type ConversationState = z.infer<typeof ConversationStateSchema>;

/**
 * Legacy-compatible fields for backward compatibility.
 * Maps the new schema to the old pending_intent/accumulated_entities shape.
 */
export function toLegacyFormat(state: ConversationState): { pending_intent: string | null; accumulated_entities: Record<string, string | null> } {
  return {
    pending_intent: state.previous_intent,
    accumulated_entities: { ...state.pending_data },
  };
}

/**
 * Creates a ConversationState from legacy format (for migration).
 */
export function fromLegacyFormat(
  chatId: string,
  pendingIntent: string | null,
  accumulatedEntities: Record<string, string | null>,
): ConversationState {
  return {
    chat_id: chatId,
    previous_intent: pendingIntent,
    active_flow: 'none',
    flow_step: 0,
    pending_data: { ...accumulatedEntities },
    last_user_utterance: null,
    last_updated: new Date().toISOString(),
    completed: false,
  };
}

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
    const existingData = existingState?.pending_data ?? {};
    const mergedData: Record<string, string | null> = { ...existingData };

    for (const [key, value] of Object.entries(entities)) {
      if (value !== null) {
        mergedData[key] = value;
      } else if (mergedData[key] === undefined) {
        mergedData[key] = null;
      }
    }

    // Determine active flow based on intent
    let activeFlow = existingState?.active_flow ?? 'none';
    let flowStep = (existingState?.flow_step ?? 0) + 1;

    // Flow transition logic
    if (intent === 'booking_wizard' || intent === 'crear_cita') {
      activeFlow = 'booking_wizard';
      flowStep = 1;
    } else if (intent === 'reagendar_cita') {
      activeFlow = 'reschedule_flow';
      flowStep = 1;
    } else if (intent === 'cancelar_cita') {
      activeFlow = 'cancellation_flow';
      flowStep = 1;
    } else if (intent === 'duda_general' && (existingState?.active_flow ?? 'none') !== 'none') {
      // Keep current flow on generic responses within a flow
      flowStep = existingState?.flow_step ?? 0;
    } else if (['completada', 'cancelada', 'reagendada'].includes(intent)) {
      activeFlow = 'none';
      flowStep = 0;
    }

    const newState: ConversationState = {
      chat_id:              chatId,
      previous_intent:      intent,
      active_flow:          activeFlow,
      flow_step:            flowStep,
      pending_data:         mergedData,
      last_user_utterance:  Object.values(entities)[0] ?? null,
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
