/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Redis-backed conversation state machine for AI Agent turn memory
 * DB Tables Used  : None — Redis only (TTL: 30 minutes)
 * Concurrency Risk: LOW — Redis single-key operations are atomic
 * GCal Calls      : NO
 * Idempotency Key : N/A
 * RLS Tenant ID   : N/A
 * Zod Schemas     : YES — ConversationStateSchema validates all stored/retrieved state
 */

// ============================================================================
// CONVERSATION STATE — Redis-backed turn memory for AI Agent
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

export async function getConversationState(
  redis: Redis,
  chatId: string,
): Promise<Result<ConversationState | null>> {
  try {
    const raw = await redis.get(`${CONV_PREFIX}${chatId}`);
    if (raw === null) return [null, null];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [null, null];
    }

    const result = ConversationStateSchema.safeParse(parsed);
    if (!result.success) {
      return [null, null];
    }

    return [null, result.data];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[CONV_STATE] Redis unavailable: ${msg}. Falling back to stateless mode.`);
    return [null, null];
  }
}

/**
 * updateConversationState — Persists intent + entities for a chat.
 * If flowStepOverride is provided, uses it instead of auto-calculating flow_step.
 */
export async function updateConversationState(
  redis: Redis,
  chatId: string,
  intent: string,
  entities: Readonly<Record<string, string | null>>,
  existingState: ConversationState | null,
  flowStepOverride?: number,
): Promise<Result<ConversationState>> {
  try {
    const existingData = existingState?.pending_data ?? {};
    const mergedData: Record<string, string | null> = { ...existingData };

    for (const [key, value] of Object.entries(entities)) {
      if (value !== null) {
        mergedData[key] = value;
      } else if (mergedData[key] === undefined) {
        mergedData[key] = null;
      }
    }

    // Use override if provided, otherwise auto-calculate
    let flowStep: number;
    let activeFlow: 'booking_wizard' | 'reschedule_flow' | 'cancellation_flow' | 'reminder_flow' | 'selecting_specialty' | 'selecting_datetime' | 'none';

    if (flowStepOverride !== undefined) {
      flowStep = flowStepOverride;
      activeFlow = flowStep > 0 ? ('booking_wizard' as const) : ('none' as const);
    } else {
      activeFlow = existingState?.active_flow ?? 'none';
      flowStep = (existingState?.flow_step ?? 0) + 1;

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
        flowStep = existingState?.flow_step ?? 0;
      } else if (['completada', 'cancelada', 'reagendada'].includes(intent)) {
        activeFlow = 'none';
        flowStep = 0;
      }
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
