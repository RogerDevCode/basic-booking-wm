//nobundling
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

import { validateInput, processConversationUpdate, formatOutput } from './services.ts';
import type { UpdateOutput } from './types.ts';

export async function main(args: any): Promise<UpdateOutput> {
  const {
    chat_id,
    intent,
    entities,
    flow_step,
    booking_state,
    booking_draft,
    message_id
  } = args || {};
  const [valErr, data] = validateInput({
    chat_id, intent, entities, flow_step, booking_state, booking_draft, message_id,
  });
  if (valErr !== null || data === null) {
    return formatOutput(false, false, valErr?.message ?? 'invalid_input');
  }

  const [updateErr, updated] = await processConversationUpdate(data);
  if (updateErr !== null) {
    return formatOutput(false, false, updateErr.message);
  }

  return formatOutput(true, updated ?? false, null);
}