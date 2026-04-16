/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Persist conversation state to Redis after AI Agent classification
 * DB Tables Used  : None — Redis only
 * Concurrency Risk: LOW — single-key SET, last-write-wins
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : YES — input validated
 */

// ============================================================================
// CONVERSATION STATE UPDATE — Persist per-chat state to Redis
// ============================================================================

import { z } from 'zod';
import {
  createConversationRedis,
  getConversationState,
  updateConversationState,
} from '../conversation-state';
import { BookingStateSchema, DraftBookingSchema } from '../booking_fsm';

const InputSchema = z.object({
  chat_id: z.string().min(1),
  intent: z.string(),
  entities: z.record(z.string(), z.string().nullable()).default({}),
  flow_step: z.number().int().min(0).optional(),
  booking_state: BookingStateSchema.nullable().optional(),
  booking_draft: DraftBookingSchema.nullable().optional(),
  message_id: z.number().int().nullable().optional(),
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

  const { chat_id, intent, entities, flow_step, booking_state, booking_draft, message_id } = parsed.data;

  const redis = createConversationRedis();
  if (redis === null) {
    return { success: true, data: { updated: false }, error_message: null };
  }

  try {
    const [getErr, existingState] = await getConversationState(redis, chat_id);
    const entitiesFlat: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(entities)) {
      entitiesFlat[k] = v;
    }
    const [err] = await updateConversationState(
      redis,
      chat_id,
      intent,
      entitiesFlat,
      getErr === null ? existingState : null,
      flow_step,
      booking_state,
      booking_draft,
      message_id,
    );
    if (err !== null) {
      return { success: false, data: { updated: false }, error_message: err.message };
    }
    return { success: true, data: { updated: true }, error_message: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, data: { updated: false }, error_message: msg };
  } finally {
    await redis.quit().catch(() => { /* ignore */ });
  }
}
