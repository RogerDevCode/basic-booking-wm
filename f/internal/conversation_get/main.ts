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

const InputSchema = z.object({
  chat_id: z.string().min(1),
}).readonly();

interface GetStateOutput {
  readonly success: boolean;
  readonly data: ConversationState | null;
  readonly error_message: string | null;
  readonly redis_connected: boolean;
}

export async function main(rawInput: unknown): Promise<GetStateOutput> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, data: null, error_message: parsed.error.message, redis_connected: false };
  }

  const { chat_id } = parsed.data;

  const redis = createConversationRedis();
  if (redis === null) {
    return { success: true, data: null, error_message: null, redis_connected: false };
  }

  try {
    const [err, state] = await getConversationState(redis, chat_id);
    return {
      success: err === null,
      data: err === null ? state : null,
      error_message: err?.message ?? null,
      redis_connected: true,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: msg, redis_connected: true };
  } finally {
    redis.quit().catch(() => { /* ignore */ });
  }
}
