/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Redis-backed conversation state machine for AI Agent turn memory (SOLID Refactored)
 * DB Tables Used  : None — Redis only (TTL: 30 minutes)
 * Concurrency Risk: LOW — Redis single-key operations are atomic
 * GCal Calls      : NO
 * Idempotency Key : N/A
 * RLS Tenant ID   : N/A
 * Zod Schemas     : YES — ConversationStateSchema validates all stored/retrieved state
 */

/**
 * REASONING TRACE
 * STEP 1 — DECOMPOSITION: 
 *   - Extract entity merging into mergeEntities (SRP)
 *   - Extract flow transition into determineFlow (SRP)
 *   - Centralize TTL and Prefix logic (DRY)
 *   - Enhance error reporting in fetch operations (Fail Fast/Loud)
 * STEP 2 — SCHEMA CROSS-CHECK: Uses ConversationStateSchema, BookingStateSchema, DraftBookingSchema.
 * STEP 3 — FAILURE MODE ANALYSIS:
 *   - Redis failure: Logged, returns [null, null] for graceful fallback if fetch, or [Error, null] for update.
 *   - Parse failure: Logged with details.
 * STEP 4 — CONCURRENCY: Redis operations remain atomic.
 * STEP 5 — SOLID ARCHITECTURE:
 *   - SRP: Logic for state calculation is decoupled from persistence.
 *   - DIP: Storage depends on Redis interface.
 *   - KISS: Flow mapping logic simplified.
 */

// ============================================================================
// CONVERSATION STATE — Redis-backed turn memory for AI Agent
// ============================================================================

import { Redis } from 'ioredis';
import { z } from 'zod';
import type { Result } from '../result/index';
import { BookingStateSchema, DraftBookingSchema, type BookingState, type DraftBooking } from '../booking_fsm';

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const DEFAULT_CONV_TTL_SECONDS = 30 * 60; // 30 minutes
const CONV_PREFIX = 'conv:';

// ── CONFIGURATION ─────────────────────────────────────────────────────────────
function getConvTTL(): number {
  const raw = process.env['CONV_STATE_TTL_SECONDS'];
  if (raw != null && raw !== '') {
    const n = Number(raw);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return DEFAULT_CONV_TTL_SECONDS;
}

// ── SCHEMA ────────────────────────────────────────────────────────────────────

/**
 * ConversationStateSchema — SSOT for conversation memory.
 * Uses .catch(null) and .default() for maximum resilience against schema drift.
 */
const ConversationStateSchema = z.object({
  chat_id:              z.string().min(1),
  provider_id:          z.uuid().nullable().catch(null),
  previous_intent:      z.string().nullable().catch(null),
  active_flow:          z.enum(['booking_wizard', 'reschedule_flow', 'cancellation_flow', 'reminder_flow', 'selecting_specialty', 'selecting_datetime', 'none']).default('none'),
  flow_step:            z.number().int().min(0).default(0),
  pending_data:         z.record(z.string(), z.string().nullable()).default({}),
  last_user_utterance:  z.string().nullable().catch(null),
  last_updated:         z.iso.datetime(),
  completed:            z.boolean().default(false),
  message_id:           z.number().int().nullable().catch(null),
  booking_state:        BookingStateSchema.nullable().catch(null),
  booking_draft:        DraftBookingSchema.nullable().catch(null),
}).readonly();

export type ConversationState = z.infer<typeof ConversationStateSchema>;

// ── DATA MAPPERS (SRP) ────────────────────────────────────────────────────────

export function toLegacyFormat(state: ConversationState): { pending_intent: string | null; accumulated_entities: Record<string, string | null> } {
  return {
    pending_intent: state.previous_intent,
    accumulated_entities: { ...state.pending_data },
  };
}

export function fromLegacyFormat(
  chatId: string,
  pendingIntent: string | null,
  accumulatedEntities: Record<string, string | null>,
  providerId: string | null = null,
): ConversationState {
  return {
    chat_id: chatId,
    provider_id: providerId,
    previous_intent: pendingIntent,
    active_flow: 'none',
    flow_step: 0,
    pending_data: { ...accumulatedEntities },
    last_user_utterance: null,
    last_updated: new Date().toISOString(),
    completed: false,
    message_id: null,
    booking_state: null,
    booking_draft: null,
  };
}

// ── PURE STATE LOGIC (SRP / KISS) ───────────────────────────────────────────

/**
 * mergeEntities — Merges incoming entities into the existing pending data.
 * KISS: Explicit loop over entries for clarity.
 */
function mergeEntities(
  existing: Readonly<Record<string, string | null>>,
  incoming: Readonly<Record<string, string | null>>
): Record<string, string | null> {
  const merged: Record<string, string | null> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    if (value !== null) {
      merged[key] = value;
    } else if (merged[key] === undefined) {
      merged[key] = null;
    }
  }
  return merged;
}

type FlowType = ConversationState['active_flow'];

/**
 * determineFlow — Decides the next active flow and step.
 * SRP: Decouples business logic from persistence.
 */
function determineFlow(
  intent: string,
  existing: ConversationState | null,
  flowStepOverride?: number
): { activeFlow: FlowType; flowStep: number } {
  // Scenario A: Manual Override (usually for completion or forced steps)
  if (flowStepOverride !== undefined) {
    return {
      activeFlow: flowStepOverride > 0 ? 'booking_wizard' : 'none',
      flowStep: flowStepOverride,
    };
  }

  // Scenario B: Natural Evolution or Intent-driven jump
  let activeFlow: FlowType = existing?.active_flow ?? 'none';
  let flowStep: number = (existing?.flow_step ?? 0) + 1;

  // Intent-driven flow entry points
  switch (intent) {
    case 'booking_wizard':
    case 'crear_cita':
      activeFlow = 'booking_wizard';
      flowStep = 1;
      break;
    case 'reagendar_cita':
      activeFlow = 'reschedule_flow';
      flowStep = 1;
      break;
    case 'cancelar_cita':
      activeFlow = 'cancellation_flow';
      flowStep = 1;
      break;
    case 'duda_general':
      // Maintain flow but don't increment step for general questions
      if (activeFlow !== 'none') {
        flowStep = existing?.flow_step ?? 0;
      }
      break;
    default:
      // Keep moving forward in current flow
      break;
  }

  return { activeFlow, flowStep };
}

// ── REDIS CLIENT FACTORY ──────────────────────────────────────────────────────

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

// ── CORE OPERATIONS (DIP) ─────────────────────────────────────────────────────

export async function getConversationState(
  redis: Redis,
  chatId: string,
): Promise<Result<ConversationState | null>> {
  try {
    const raw = await redis.get(`${CONV_PREFIX}${chatId}`);
    if (raw === null) return [null, null];

    const parsed: unknown = JSON.parse(raw);
    const result = ConversationStateSchema.safeParse(parsed);
    
    if (!result.success) {
      console.warn(`[CONV_STATE] Validation failed for ${chatId}: ${result.error.message}`);
      // Fail Loudly in logs, but fallback gracefully to stateless mode
      return [null, null];
    }

    return [null, result.data];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[CONV_STATE] Redis/Parse error: ${msg}. Falling back to stateless mode.`);
    return [null, null]; // Resilience: fall back to stateless if Redis is down
  }
}

/**
 * updateConversationState — Persists intent + entities for a chat.
 * SOLID: Uses helper functions for entity merging and flow calculation.
 */
export async function updateConversationState(
  redis: Redis,
  chatId: string,
  intent: string,
  entities: Readonly<Record<string, string | null>>,
  existingState: ConversationState | null,
  flowStepOverride?: number,
  bookingState?: BookingState | null,
  bookingDraft?: DraftBooking | null,
  messageId?: number | null,
  providerId?: string | null,
): Promise<Result<ConversationState>> {
  try {
    const mergedData = mergeEntities(existingState?.pending_data ?? {}, entities);
    const { activeFlow, flowStep } = determineFlow(intent, existingState, flowStepOverride);

    const newState: ConversationState = Object.freeze({
      chat_id:              chatId,
      provider_id:          providerId !== undefined ? providerId : (existingState?.provider_id ?? null),
      previous_intent:      intent,
      active_flow:          activeFlow,
      flow_step:            flowStep,
      pending_data:         mergedData,
      last_user_utterance:  Object.values(entities)[0] ?? null,
      last_updated:         new Date().toISOString(),
      completed:            false,
      message_id:           messageId !== undefined ? messageId : (existingState?.message_id ?? null),
      booking_state:        bookingState !== undefined ? bookingState : (existingState?.booking_state ?? null),
      booking_draft:        bookingDraft !== undefined ? bookingDraft : (existingState?.booking_draft ?? null),
    });

    const ttl = getConvTTL();
    await redis.setex(`${CONV_PREFIX}${chatId}`, ttl, JSON.stringify(newState));
    
    return [null, newState];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[CONV_STATE] Update failed: ${msg}`);
    return [new Error(`conv_state_update_failed: ${msg}`), null];
  }
}

export async function clearConversationState(
  redis: Redis,
  chatId: string,
): Promise<Result<null>> {
  try {
    await redis.del(`${CONV_PREFIX}${chatId}`);
    return [null, null];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[CONV_STATE] Clear failed: ${msg}`);
    return [new Error(`conv_state_clear_failed: ${msg}`), null];
  }
}
