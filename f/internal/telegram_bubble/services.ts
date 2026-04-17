import { Redis } from 'ioredis';
import {
  type BookingState,
  type DraftBooking,
  type BookingAction,
  emptyDraft,
  applyTransition,
  parseAction,
  parseCallbackData,
  flowStepFromState,
  buildSpecialtyKeyboard,
  buildDoctorKeyboard,
  buildTimeSlotKeyboard,
  buildConfirmationKeyboard,
} from '../booking_fsm';
import type { Result } from '../result';
import type { BubbleOutput, ConvState, InlineButton } from './types';

// ============================================================================
// Mock Data Store (replaces DB queries in tests)
// ============================================================================

const MOCK_SPECIALTIES = [
  { id: 's1', name: 'Cardiología' },
  { id: 's2', name: 'Pediatría' },
  { id: 's3', name: 'Dermatología' },
];

const MOCK_DOCTORS: Record<string, { id: string; name: string }[]> = {
  s1: [
    { id: 'd1', name: 'Dr. Pérez' },
    { id: 'd2', name: 'Dra. Kim' },
  ],
  s2: [
    { id: 'd3', name: 'Dr. López' },
  ],
  s3: [
    { id: 'd4', name: 'Dra. García' },
  ],
};

const MOCK_SLOTS: Record<string, { id: string; label: string; start_time: string }[]> = {
  d1: [
    { id: 't1', label: '9:00 AM', start_time: '2026-04-13T09:00:00Z' },
    { id: 't2', label: '10:00 AM', start_time: '2026-04-13T10:00:00Z' },
    { id: 't3', label: '11:30 AM', start_time: '2026-04-13T11:30:00Z' },
  ],
  d2: [
    { id: 't1', label: '2:00 PM', start_time: '2026-04-13T14:00:00Z' },
    { id: 't2', label: '3:30 PM', start_time: '2026-04-13T15:30:00Z' },
  ],
  d4: [
    { id: 't1', label: '8:00 AM', start_time: '2026-04-13T08:00:00Z' },
    { id: 't2', label: '11:00 AM', start_time: '2026-04-13T11:00:00Z' },
  ],
};

// ============================================================================
// Redis State Store (REAL Redis)
// ============================================================================

const CONV_PREFIX = 'conv:bubble:';

export function createRedis(): Redis | null {
  const url = process.env['REDIS_URL'];
  if (!url) return null;
  return new Redis(url, { lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 2 });
}

export async function getConvState(redis: Redis, chatId: string): Promise<ConvState> {
  const raw = await redis.get(`${CONV_PREFIX}${chatId}`);
  if (!raw) return { bookingState: null, draft: emptyDraft(), messageId: null };
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const bs = parsed['bookingState'];
  const dr = parsed['draft'];
  return {
    bookingState: bs !== null && bs !== undefined && typeof bs === 'object' ? bs as BookingState : null,
    draft: dr !== null && dr !== undefined && typeof dr === 'object' ? dr as DraftBooking : emptyDraft(),
    messageId: typeof parsed['messageId'] === 'number' ? parsed['messageId'] : null,
  };
}

export async function setConvState(redis: Redis, chatId: string, bookingState: BookingState, draft: DraftBooking, messageId: number | null): Promise<void> {
  await redis.set(`${CONV_PREFIX}${chatId}`, JSON.stringify({ bookingState, draft, messageId }), 'EX', 1800);
}

export async function clearConvState(redis: Redis, chatId: string): Promise<void> {
  await redis.del(`${CONV_PREFIX}${chatId}`);
}

// ============================================================================
// Bubble Engine
// ============================================================================

export class TelegramBubble {
  private readonly redis: Redis | null;

  constructor(private readonly chatId: string) {
    this.redis = createRedis();
  }

  async close(): Promise<void> {
    await this.redis?.quit().catch(() => { /* ignore */ });
  }

  async send(text: string | null, callbackData: string | null): Promise<Result<BubbleOutput>> {
    if (!this.redis) return [new Error('Redis not available'), null];

    const startMs = Date.now();
    const conv = await getConvState(this.redis, this.chatId);

    // Determine action from callback or text
    const action: BookingAction | null = callbackData !== null
      ? parseCallbackData(callbackData)
      : (text !== null ? parseAction(text) : null);

    if (action === null) {
      return this.fallbackResponse(startMs);
    }

    // Handle "1" / "agendar cita" → start wizard
    if (conv.bookingState === null && action.type === 'select' && action.value === '1') {
      return this.startWizard(startMs);
    }

    // Handle /start or /menu
    if (text !== null && ['/start', '/menu'].includes(text.trim().toLowerCase())) {
      return this.menuResponse(startMs);
    }

    // If no active wizard, fallback
    if (conv.bookingState === null) {
      return this.fallbackResponse(startMs);
    }

    // Process wizard step
    return this.processStep(conv.bookingState, conv.draft, action, startMs);
  }

  private async startWizard(startMs: number): Promise<Result<BubbleOutput>> {
    if (!this.redis) return [new Error('Redis not available'), null];
    const state: BookingState = { name: 'selecting_specialty', error: null, items: MOCK_SPECIALTIES };
    await setConvState(this.redis, this.chatId, state, emptyDraft(), null);
    return [null, {
      text: '📅 *Paso 1:* Selecciona la especialidad:',
      inline_keyboard: buildSpecialtyKeyboard(MOCK_SPECIALTIES),
      route: 'wizard', latency_ms: Date.now() - startMs, step_name: 'selecting_specialty', step_num: 1, should_edit: false, draft_summary: '',
    }];
  }

  private menuResponse(startMs: number): Result<BubbleOutput> {
    return [null, {
      text: '📱 *Menú Principal*\n\n1️⃣ Agendar cita\n2️⃣ Mis citas\n3️⃣ Recordatorios\n4️⃣ Información',
      inline_keyboard: [
        [{ text: '📅 Agendar cita', callback_data: 'menu:book' }],
        [{ text: '📋 Mis citas', callback_data: 'menu:mybookings' }, { text: '🔔 Recordatorios', callback_data: 'menu:reminders' }],
        [{ text: 'ℹ️ Información', callback_data: 'menu:info' }],
      ],
      route: 'command', latency_ms: Date.now() - startMs, step_name: 'idle', step_num: 0, should_edit: false, draft_summary: '',
    }];
  }

  private fallbackResponse(startMs: number): Result<BubbleOutput> {
    return [null, {
      text: '⚠️ No entiendo tu mensaje. Escribe /start o 1 para agendar.',
      inline_keyboard: [],
      route: 'ai_agent', latency_ms: Date.now() - startMs, step_name: 'idle', step_num: 0, should_edit: false, draft_summary: '',
    }];
  }

  private async processStep(state: BookingState, draft: DraftBooking, action: BookingAction, startMs: number): Promise<Result<BubbleOutput>> {
    if (!this.redis) return [new Error('Redis not available'), null];

    // Enrich state with mock items so FSM can read from state.items
    const enrichedState = this.enrichStateWithMock(state);
    const [transitionErr, transition] = applyTransition(enrichedState, action, draft, this.getMockItemsForState(enrichedState));

    if (transitionErr !== null || transition === null) {
      const finalOutcome = transition ?? { nextState: state, responseText: transitionErr?.message ?? 'Error', advance: false };
      // Stay on current state with error
      return [null, {
        text: finalOutcome.responseText,
        inline_keyboard: this.getKeyboardForState(state),
        route: 'wizard', latency_ms: Date.now() - startMs, step_name: state.name, step_num: flowStepFromState(state), should_edit: true, draft_summary: this.draftSummary(draft),
      }];
    }

    const nextState = transition.nextState;

    // Handle cancel
    if (action.type === 'cancel') {
      await clearConvState(this.redis, this.chatId);
      return this.menuResponse(startMs);
    }

    // Handle completed
    if (nextState.name === 'completed') {
      await clearConvState(this.redis, this.chatId);
      return [null, {
        text: '✅ *Reserva Confirmada*\n\nTu cita ha sido agendada correctamente.',
        inline_keyboard: [],
        route: 'wizard', latency_ms: Date.now() - startMs, step_name: 'completed', step_num: 5, should_edit: true, draft_summary: draft.start_time ?? 'N/A',
      }];
    }

    // Enrich nextState with mock items before saving
    const enrichedNextState = this.enrichStateWithMock(nextState);

    // Save new state
    const newDraft = this.mergeDraft(draft, enrichedNextState, action);
    await setConvState(this.redis, this.chatId, enrichedNextState, newDraft, null);

    // Generate response with mock data for next step
    const nextItems = this.getMockItemsForState(enrichedNextState);
    const keyboard = this.getKeyboardForState(enrichedNextState, nextItems);

    return [null, {
      text: transition.responseText,
      inline_keyboard: keyboard,
      route: 'wizard', latency_ms: Date.now() - startMs, step_name: enrichedNextState.name, step_num: flowStepFromState(enrichedNextState), should_edit: true, draft_summary: this.draftSummary(newDraft),
    }];
  }

  private enrichStateWithMock(state: BookingState): BookingState {
    switch (state.name) {
      case 'selecting_specialty': return { ...state, items: MOCK_SPECIALTIES };
      case 'selecting_doctor': return { ...state, items: MOCK_DOCTORS[state.specialtyId] ?? [] };
      case 'selecting_time': return { ...state, items: MOCK_SLOTS[state.doctorId] ?? [] };
      case 'confirming':
      case 'completed':
      case 'idle':
        return state;
    }
  }

  private getMockItemsForState(state: BookingState): { id: string; name: string; label?: string; start_time?: string }[] {
    switch (state.name) {
      case 'selecting_specialty': return MOCK_SPECIALTIES;
      case 'selecting_doctor': return (MOCK_DOCTORS[state.specialtyId] ?? []) as { id: string; name: string; label?: string; start_time?: string }[];
      case 'selecting_time': return (MOCK_SLOTS[state.doctorId] ?? []) as { id: string; name: string; label?: string; start_time?: string }[];
      case 'confirming':
      case 'completed':
      case 'idle':
        return [];
    }
  }

  private getKeyboardForState(state: BookingState, items?: { id: string; name?: string; label?: string; start_time?: string }[]): InlineButton[][] {
    switch (state.name) {
      case 'selecting_specialty': return buildSpecialtyKeyboard((items ?? []).filter((i): i is { id: string; name: string } => 'name' in i && typeof i.name === 'string'));
      case 'selecting_doctor': return buildDoctorKeyboard((items ?? []).filter((i): i is { id: string; name: string } => 'name' in i && typeof i.name === 'string'));
      case 'selecting_time': return buildTimeSlotKeyboard((items ?? []).filter((i): i is { id: string; label: string; start_time: string } => 'label' in i && typeof i.label === 'string' && 'start_time' in i));
      case 'confirming': return buildConfirmationKeyboard();
      case 'completed':
      case 'idle':
        return [];
    }
  }

  private mergeDraft(draft: DraftBooking, state: BookingState, action: BookingAction): DraftBooking {
    if (state.name === 'selecting_doctor' && action.type === 'select') {
      const lastState = draft._lastState;
      if (lastState?.name === 'selecting_doctor') {
        const items = MOCK_DOCTORS[lastState.specialtyId] ?? [];
        const idx = parseInt(action.value, 10) - 1;
        if (idx >= 0 && idx < items.length) {
          const item = items[idx];
          if (item === undefined) return draft;
          return { ...draft, doctor_id: item.id, doctor_name: item.name };
        }
      }
    }
    return draft;
  }

  private draftSummary(draft: DraftBooking): string {
    const parts = [];
    if (draft.specialty_name) parts.push(draft.specialty_name);
    if (draft.doctor_name) parts.push(draft.doctor_name);
    if (draft.time_label) parts.push(draft.time_label);
    return parts.join(' → ');
  }
}
