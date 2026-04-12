/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Persist conversation state to Redis after AI Agent classification
 * DB Tables Used  : None — Redis only
 * Concurrency Risk: LOW — single-key SET, last-write-wins (acceptable)
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : YES — input validated
 */

// ============================================================================
// CONVERSATION STATE UPDATE — Persist per-chat state to Redis
// ============================================================================
// Called after the AI Agent classifies intent. Stores the intent and extracted
// entities so the next user turn can be context-aware.
// Graceful degradation: silently ignores errors if Redis is unavailable.
// ============================================================================

import { z } from 'zod';
import {
  createConversationRedis,
  getConversationState,
  updateConversationState,
} from '../conversation-state';

const InputSchema = z.object({
  chat_id: z.string().min(1),
  intent: z.string(),
  entities: z.record(z.string(), z.unknown()).default({}),
}).readonly();

interface UpdateOutput {
  readonly success: boolean;
  readonly data: { updated: boolean };
  readonly error_message: string | null;
}

export async function main(rawInput: unknown): Promise<UpdateOutput> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, data: { updated: false }, error_message: parsed.error.message };
  }

  const { chat_id, intent, entities } = parsed.data;

  const redis = createConversationRedis();
  if (redis === null) {
    return { success: true, data: { updated: false }, error_message: null };
  }

  try {
    const [getErr, existingState] = await getConversationState(redis, chat_id);
    const entitiesFlat: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(entities)) {
      entitiesFlat[k] = v !== null && v !== undefined ? String(v) : null;
    }
    const [err] = await updateConversationState(redis, chat_id, intent, entitiesFlat, getErr === null ? existingState : null);
    if (err !== null) {
      return { success: false, data: { updated: false }, error_message: err.message };
    }
    return { success: true, data: { updated: true }, error_message: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, data: { updated: false }, error_message: msg };
  } finally {
    redis.quit().catch(() => { /* ignore */ });
  }
}
