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

import { validateInput, fetchConversationData, formatOutput } from './services';
import type { GetStateOutput } from './types';

/**
 * main — Entry point for Windmill conversation_get.
 * Orchestrates the retrieval of conversation state using SOLID principles.
 * SRP: delegates validation, fetching, and response formatting.
 * Go-style TS: uses [Error | null, Result | null] tuples via helper functions.
 */
export async function main(chat_id: string): Promise<GetStateOutput> {
  const [valErr, chatId] = validateInput({ chat_id });
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
