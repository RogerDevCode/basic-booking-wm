/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Retrieve conversation state from Redis for the current chat_id
 * DB Tables Used  : None — Redis only
 * Concurrency Risk: NO — read-only GET operation
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : YES — input validated
 */

// ============================================================================
// CONVERSATION STATE GET — Retrieve per-chat state from Redis
// ============================================================================
// Called early in the flow so downstream scripts (AI Agent, orchestrator)
// know the conversation context (what menu the user is in, pending data, etc).
// Graceful degradation: returns null state if Redis is unavailable.
// ============================================================================

import { z } from 'zod';
import { createConversationRedis, getConversationState, type ConversationState } from '../conversation-state';
import type { Result } from '../result';

// ── SCHEMA & TYPES ────────────────────────────────────────────────────────────

const InputSchema = z.object({
  chat_id: z.string().min(1),
}).readonly();

type ChatId = z.infer<typeof InputSchema>['chat_id'];

interface GetStateOutput {
  readonly success: boolean;
  readonly data: ConversationState | null;
  readonly error_message: string | null;
  readonly redis_connected: boolean;
}

interface FetchResult {
  readonly data: ConversationState | null;
  readonly redis_connected: boolean;
}

// ── MAIN ENTRY POINT ──────────────────────────────────────────────────────────

/**
 * main — Entry point for Windmill conversation_get.
 * Orchestrates the retrieval of conversation state using SOLID principles.
 * SRP: delegates validation, fetching, and response formatting.
 * Go-style TS: uses [Error | null, Result | null] tuples via helper functions.
 */
export async function main(rawInput: unknown): Promise<GetStateOutput> {
  const [valErr, chatId] = validateInput(rawInput);
  if (valErr !== null || chatId === null) {
    return formatOutput(false, null, valErr?.message ?? 'invalid_input', false);
  }

  const [fetchErr, fetchResult] = await fetchConversationData(chatId);
  if (fetchErr !== null) {
    return formatOutput(false, null, fetchErr.message, fetchResult?.redis_connected ?? false);
  }

  return formatOutput(
    true,
    fetchResult?.data ?? null,
    null,
    fetchResult?.redis_connected ?? false
  );
}

// ── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

/**
 * validateInput — Validates the raw input against the InputSchema.
 */
function validateInput(rawInput: unknown): Result<ChatId> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(parsed.error.message), null];
  }
  return [null, parsed.data.chat_id];
}

/**
 * fetchConversationData — Manages the Redis client lifecycle and data retrieval.
 * Gracefully handles Redis unavailability per requirements.
 */
async function fetchConversationData(chatId: string): Promise<Result<FetchResult>> {
  const redis = createConversationRedis();
  
  if (redis === null) {
    return [null, { data: null, redis_connected: false }];
  }

  try {
    const [err, state] = await getConversationState(redis, chatId);
    
    if (err !== null) {
      return [err, { data: null, redis_connected: true }];
    }

    return [null, { data: state, redis_connected: true }];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`redis_operation_failed: ${msg}`), { data: null, redis_connected: true }];
  } finally {
    // Fire-and-forget disconnection to prevent leaking connections
    void redis.quit().catch(() => { /* skip log on cleanup failure */ });
  }
}

/**
 * formatOutput — Standardizes the GetStateOutput response.
 */
function formatOutput(
  success: boolean,
  data: ConversationState | null,
  errorMessage: string | null,
  redisConnected: boolean
): GetStateOutput {
  return {
    success,
    data,
    error_message: errorMessage,
    redis_connected: redisConnected,
  };
}
