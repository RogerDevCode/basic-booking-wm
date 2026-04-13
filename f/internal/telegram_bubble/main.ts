/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Telegram "bubble" — single entry/exit for testing full message flows with FSM wizard
 * DB Tables Used  : None — pure flow simulation, no DB (uses mock items)
 * Concurrency Risk: NO — single sequential execution
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : YES — all inputs validated
 */

// ============================================================================
// TELEGRAM BUBBLE — Conversational Test Harness
// ============================================================================
// Simulates the complete Telegram → Bot → Telegram pipeline.
// Maintains in-memory state (mock Redis) so the bot "remembers" context.
// Supports inline keyboard callbacks (spec:1, doc:2, time:3, cfm:yes, etc.)
//
// Usage:
//   npx tsx f/internal/telegram_bubble/main.ts "/start"
//   npx tsx f/internal/telegram_bubble/main.ts "1"
//   npx tsx f/internal/telegram_bubble/main.ts "spec:1"
//   npx tsx f/internal/telegram_bubble/main.ts "cfm:yes"
//   npx tsx f/internal/telegram_bubble/main.ts --interactive
// ============================================================================

import { z } from 'zod';
import {
  type BookingState,
  type DraftBooking,
  emptyDraft,
  parseAction,
  parseCallbackData,
  flowStepFromState,
  buildSpecialtyKeyboard,
  buildDoctorKeyboard,
  buildTimeSlotKeyboard,
  buildConfirmationKeyboard,
} from '../booking_fsm';

// ============================================================================
// Types
// ============================================================================

type Result<T> = [Error | null, T | null];

interface InlineButton {
  readonly text: string;
  readonly callback_data: string;
}

interface BubbleOutput {
  readonly text: string;
  readonly inline_keyboard: InlineButton[][];
  readonly route: string;
  readonly latency_ms: number;
  readonly step_name: string;
  readonly step_num: number;
  readonly should_edit: boolean;
  readonly draft_summary: string;
}

// ============================================================================
// Mock Data Store (replaces DB queries in tests)
// ============================================================================

const MOCK_SPECIALTIES = [
  { id: 's1', name: 'Cardiología' },
  { id: 's2', name: 'Pediatría' },
  { id: 's3', name: 'Dermatología' },
];

const MOCK_DOCTORS: Record<string, Array<{ id: string; name: string }>> = {
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

const MOCK_SLOTS: Record<string, Array<{ id: string; label: string; start_time: string }>> = {
  d1: [
    { id: 't1', label: '9:00 AM', start_time: '2026-04-13T09:00:00Z' },
    { id: 't2', label: '10:00 AM', start_time: '2026-04-13T10:00:00Z' },
    { id: 't3', label: '11:30 AM', start_time: '2026-04-13T11:30:00Z' },
  ],
  d2: [
    { id: 't1', label: '2:00 PM', start_time: '2026-04-13T14:00:00Z' },
    { id: 't2', label: '3:30 PM', start_time: '2026-04-13T15:30:00Z' },
  ],
};

// ============================================================================
// In-Memory State Store (Mock Redis)
// ============================================================================

class MockStateStore {
  private store = new Map<string, { state: BookingState; draft: DraftBooking; messageId: number }>();
  private nextMsgId = 1000;

  get(chatId: string): { state: BookingState; draft: DraftBooking; messageId: number } | null {
    return this.store.get(chatId) ?? null;
  }

  set(chatId: string, state: BookingState, draft: DraftBooking): number {
    const messageId = this.nextMsgId++;
    this.store.set(chatId, { state, draft, messageId });
    return messageId;
  }

  updateMessageId(chatId: string, messageId: number): void {
    const entry = this.store.get(chatId);
    if (entry) {
      this.store.set(chatId, { ...entry, messageId });
    }
  }

  clear(chatId: string): void {
    this.store.delete(chatId);
  }
}

// ============================================================================
// Bubble Engine
// ============================================================================

class TelegramBubble {
  private static sharedStore = new MockStateStore();
  private store = TelegramBubble.sharedStore;

  constructor(private chatId: string) {}

  async send(text: string | null, callbackData: string | null): Promise<Result<BubbleOutput>> {
    const startMs = Date.now();
    const { state, draft } = this.store.get(this.chatId) ?? { state: null as BookingState | null, draft: null as DraftBooking | null };

    // Check for wizard callback pattern
    const isWizardCb = callbackData !== null && /^(spec|doc|time|cfm|back|cancel):?/.test(callbackData) || callbackData === 'back' || callbackData === 'cancel';

    if (isWizardCb && state !== null && state.name !== 'idle') {
      return this.processWizardStep(state, draft ?? emptyDraft(), callbackData);
    }

    // Check for menu command "1" (agendar cita) → start wizard
    if (callbackData === null && text !== null && ['1', 'agendar cita'].includes(text.trim().toLowerCase())) {
      return this.startWizard();
    }

    // Check for commands
    if (text !== null && ['/start', '/menu'].includes(text.trim().toLowerCase())) {
      const elapsed = Date.now() - startMs;
      return [null, {
        text: '📱 *Menú Principal*\n\n1️⃣ Agendar cita\n2️⃣ Mis citas\n3️⃣ Recordatorios\n4️⃣ Información\n\nEscribe el número o toca un botón:',
        inline_keyboard: [
          [{ text: '📅 Agendar cita', callback_data: 'menu:book' }],
          [{ text: '📋 Mis citas', callback_data: 'menu:mybookings' }, { text: '🔔 Recordatorios', callback_data: 'menu:reminders' }],
          [{ text: 'ℹ️ Información', callback_data: 'menu:info' }],
        ],
        route: 'command',
        latency_ms: elapsed,
        step_name: 'menu',
        step_num: 0,
        should_edit: false,
        draft_summary: '',
      }];
    }

    // Fallback
    const elapsed = Date.now() - startMs;
    return [null, {
      text: '⚠️ No entiendo tu mensaje. Usa el menú o escribe un número.',
      inline_keyboard: [],
      route: 'ai_agent',
      latency_ms: elapsed,
      step_name: 'idle',
      step_num: 0,
      should_edit: false,
      draft_summary: '',
    }];
  }

  private startWizard(): Result<BubbleOutput> {
    const state: BookingState = {
      name: 'selecting_specialty',
      error: null,
      items: MOCK_SPECIALTIES,
    };
    const draft = emptyDraft();
    this.store.set(this.chatId, state, draft);

    return [null, {
      text: '📅 *Paso 1:* Selecciona la especialidad:',
      inline_keyboard: buildSpecialtyKeyboard(MOCK_SPECIALTIES),
      route: 'wizard',
      latency_ms: 0,
      step_name: 'selecting_specialty',
      step_num: 1,
      should_edit: false,
      draft_summary: '',
    }];
  }

  private processWizardStep(state: BookingState, draft: DraftBooking, callbackData: string | null): Result<BubbleOutput> {
    const action = callbackData !== null ? parseCallbackData(callbackData) : null;
    if (action === null) {
      return [new Error(`callback_data no reconocido: ${callbackData}`), null];
    }

    const elapsed = Date.now();

    switch (state.name) {
      case 'selecting_specialty': {
        if (action.type === 'cancel') {
          this.store.clear(this.chatId);
          return [null, this.menuResponse(elapsed)];
        }
        const idx = parseInt(action.value, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= state.items.length) {
          return [null, {
            text: '⚠️ Opción inválida. Elige una especialidad:',
            inline_keyboard: buildSpecialtyKeyboard(state.items),
            route: 'wizard', latency_ms: elapsed - Date.now(), step_name: 'selecting_specialty', step_num: 1, should_edit: true, draft_summary: '',
          }];
        }
        const specialty = state.items[idx];
        const doctors = MOCK_DOCTORS[specialty.id] ?? [];
        if (doctors.length === 0) {
          return [null, {
            text: `No hay doctores en *${specialty.name}*.`,
            inline_keyboard: [], route: 'wizard', latency_ms: elapsed - Date.now(), step_name: 'idle', step_num: 0, should_edit: false, draft_summary: '',
          }];
        }
        const newState: BookingState = {
          name: 'selecting_doctor',
          specialtyId: specialty.id,
          specialtyName: specialty.name,
          error: null,
          items: doctors,
        };
        const newDraft: DraftBooking = { ...draft, specialty_id: specialty.id, specialty_name: specialty.name };
        this.store.set(this.chatId, newState, newDraft);

        return [null, {
          text: `👨‍⚕️ *Paso 2:* Selecciona el doctor en *${specialty.name}*`,
          inline_keyboard: buildDoctorKeyboard(doctors),
          route: 'wizard', latency_ms: elapsed - Date.now(), step_name: 'selecting_doctor', step_num: 2, should_edit: true, draft_summary: specialty.name,
        }];
      }

      case 'selecting_doctor': {
        if (action.type === 'back') {
          this.store.set(this.chatId, {
            name: 'selecting_specialty', error: null, items: MOCK_SPECIALTIES,
          }, draft);
          return [null, {
            text: '📅 *Paso 1:* Selecciona la especialidad:',
            inline_keyboard: buildSpecialtyKeyboard(MOCK_SPECIALTIES),
            route: 'wizard', latency_ms: elapsed - Date.now(), step_name: 'selecting_specialty', step_num: 1, should_edit: true, draft_summary: '',
          }];
        }
        if (action.type === 'cancel') {
          this.store.clear(this.chatId);
          return [null, this.menuResponse(elapsed)];
        }
        const idx = parseInt(action.value, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= state.items.length) {
          return [null, {
            text: '⚠️ Opción inválida.',
            inline_keyboard: buildDoctorKeyboard(state.items),
            route: 'wizard', latency_ms: elapsed - Date.now(), step_name: 'selecting_doctor', step_num: 2, should_edit: true, draft_summary: state.specialtyName,
          }];
        }
        const doctor = state.items[idx];
        const slots = MOCK_SLOTS[doctor.id] ?? [];
        const newState: BookingState = {
          name: 'selecting_time',
          specialtyId: state.specialtyId,
          doctorId: doctor.id,
          doctorName: doctor.name,
          error: null,
          items: slots,
        };
        const newDraft: DraftBooking = { ...draft, doctor_id: doctor.id, doctor_name: doctor.name };
        this.store.set(this.chatId, newState, newDraft);

        return [null, {
          text: `🕐 *Paso 3:* Selecciona el horario con *${doctor.name}*`,
          inline_keyboard: buildTimeSlotKeyboard(slots),
          route: 'wizard', latency_ms: elapsed - Date.now(), step_name: 'selecting_time', step_num: 3, should_edit: true, draft_summary: `${state.specialtyName} → ${doctor.name}`,
        }];
      }

      case 'selecting_time': {
        if (action.type === 'back') {
          const doctors = MOCK_DOCTORS[state.specialtyId] ?? [];
          const newState: BookingState = {
            name: 'selecting_doctor',
            specialtyId: state.specialtyId,
            specialtyName: state.doctorName,
            error: null,
            items: doctors,
          };
          this.store.set(this.chatId, newState, draft);
          return [null, {
            text: `👨‍⚕️ *Paso 2:* Selecciona el doctor en *${state.specialtyId}*`,
            inline_keyboard: buildDoctorKeyboard(doctors),
            route: 'wizard', latency_ms: elapsed - Date.now(), step_name: 'selecting_doctor', step_num: 2, should_edit: true, draft_summary: state.specialtyName,
          }];
        }
        if (action.type === 'cancel') {
          this.store.clear(this.chatId);
          return [null, this.menuResponse(elapsed)];
        }
        const idx = parseInt(action.value, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= state.items.length) {
          return [null, {
            text: '⚠️ Opción inválida.',
            inline_keyboard: buildTimeSlotKeyboard(state.items),
            route: 'wizard', latency_ms: elapsed - Date.now(), step_name: 'selecting_time', step_num: 3, should_edit: true, draft_summary: `${state.specialtyName} → ${state.doctorName}`,
          }];
        }
        const slot = state.items[idx];
        const newState: BookingState = {
          name: 'confirming',
          specialtyId: state.specialtyId,
          doctorId: state.doctorId,
          doctorName: state.doctorName,
          timeSlot: slot.label,
          draft: { ...draft, start_time: slot.start_time, time_label: slot.label },
        };
        this.store.set(this.chatId, newState, { ...draft, start_time: slot.start_time, time_label: slot.label });

        return [null, {
          text: `📋 *Paso 4:* Confirmar Cita\n\n🕐 ${slot.label}\n👨‍⚕️ ${state.doctorName}\n\n¿Confirmas esta cita?`,
          inline_keyboard: buildConfirmationKeyboard(),
          route: 'wizard', latency_ms: elapsed - Date.now(), step_name: 'confirming', step_num: 4, should_edit: true, draft_summary: `${state.specialtyName} → ${state.doctorName} → ${slot.label}`,
        }];
      }

      case 'confirming': {
        if (action.type === 'confirm_yes') {
          this.store.clear(this.chatId);
          return [null, {
            text: '✅ *Reserva Confirmada*\n\nTu cita ha sido agendada correctamente.\nRecibirás un recordatorio antes de tu cita.',
            inline_keyboard: [],
            route: 'wizard', latency_ms: elapsed - Date.now(), step_name: 'completed', step_num: 5, should_edit: true, draft_summary: draft.start_time ?? 'N/A',
          }];
        }
        if (action.type === 'confirm_no' || action.type === 'back') {
          const slots = MOCK_SLOTS[state.doctorId] ?? [];
          const newState: BookingState = {
            name: 'selecting_time',
            specialtyId: state.specialtyId,
            doctorId: state.doctorId,
            doctorName: state.doctorName,
            error: null,
            items: slots,
          };
          this.store.set(this.chatId, newState, draft);
          return [null, {
            text: `🕐 *Paso 3:* Selecciona el horario con *${state.doctorName}*`,
            inline_keyboard: buildTimeSlotKeyboard(slots),
            route: 'wizard', latency_ms: elapsed - Date.now(), step_name: 'selecting_time', step_num: 3, should_edit: true, draft_summary: `${state.specialtyName} → ${state.doctorName}`,
          }];
        }
        if (action.type === 'cancel') {
          this.store.clear(this.chatId);
          return [null, this.menuResponse(elapsed)];
        }
        return [new Error('Acción no reconocida en confirmación'), null];
      }

      default: {
        return [new Error(`Estado desconocido: ${state.name}`), null];
      }
    }
  }

  private menuResponse(elapsed: number): BubbleOutput {
    return {
      text: '📱 *Menú Principal*\n\n1️⃣ Agendar cita\n2️⃣ Mis citas\n3️⃣ Recordatorios\n4️⃣ Información',
      inline_keyboard: [
        [{ text: '📅 Agendar cita', callback_data: 'menu:book' }],
        [{ text: '📋 Mis citas', callback_data: 'menu:mybookings' }, { text: '🔔 Recordatorios', callback_data: 'menu:reminders' }],
        [{ text: 'ℹ️ Información', callback_data: 'menu:info' }],
      ],
      route: 'menu', latency_ms: elapsed, step_name: 'idle', step_num: 0, should_edit: false, draft_summary: '',
    };
  }
}

// ============================================================================
// CLI
// ============================================================================

const stepIcons: Record<string, string> = {
  idle: '📱',
  selecting_specialty: '📅',
  selecting_doctor: '👨‍⚕️',
  selecting_time: '🕐',
  confirming: '📋',
  completed: '✅',
};

function formatResponse(output: BubbleOutput) {
  const icon = stepIcons[output.step_name] ?? '💬';
  const keyboard = output.inline_keyboard.length > 0
    ? `\n  [${output.inline_keyboard.map(row => row.map(btn => `"${btn.text}"`).join(' | ')).join('] [')}]`
    : '';
  const edit = output.should_edit ? ' ✏️ (edit)' : ' 📤 (new)';

  console.log(`\n${'─'.repeat(64)}`);
  console.log(`  ${icon} Paso ${output.step_num}: ${output.step_name} | ${output.latency_ms}ms${edit}`);
  if (output.draft_summary) console.log(`  📝 Contexto: ${output.draft_summary}`);
  console.log(`${'─'.repeat(64)}`);
  console.log(`  ${output.text.replace(/\n/g, '\n  ')}`);
  if (keyboard) console.log(`  Teclado:${keyboard}`);
  console.log(`${'─'.repeat(64)}\n`);
}

async function interactiveMode() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   TELEGRAM BUBBLE — Conversational Test Harness          ║');
  console.log('║   Simula el flujo completo de Telegram con FSM + Redis   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\n  Comandos especiales:');
  console.log('    /start       → Menú principal');
  console.log('    1            → Agendar cita (inicia wizard)');
  console.log('    spec:N       → Seleccionar especialidad');
  console.log('    doc:N        → Seleccionar doctor');
  console.log('    time:N       → Seleccionar horario');
  console.log('    cfm:yes      → Confirmar cita');
  console.log('    cfm:no       → No confirmar');
  console.log('    back         → Volver');
  console.log('    cancel       → Cancelar');
  console.log('    status       → Ver estado actual');
  console.log('    quit/exit    → Salir\n');

  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const chatId = process.env['BUBBLE_CHAT_ID'] || 'test-user-001';
  const bubble = new TelegramBubble(chatId);

  console.log(`  Chat ID: ${chatId}\n`);

  const ask = () => {
    rl.question('You> ', async (input) => {
      const trimmed = input.trim();
      if (!trimmed) { ask(); return; }
      if (trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'exit') {
        console.log('\nBye!\n');
        rl.close();
        process.exit(0);
        return;
      }
      if (trimmed.toLowerCase() === 'status') {
        const entry = (bubble as any).store.get(chatId);
        if (entry) {
          console.log(`\n  Estado: ${entry.state.name} (paso ${flowStepFromState(entry.state)})`);
          console.log(`  Draft: ${JSON.stringify(entry.draft, null, 2)}\n`);
        } else {
          console.log('\n  Sin estado activo (idle)\n');
        }
        ask();
        return;
      }

      const cbMatch = trimmed.match(/^(spec|doc|time|cfm|menu|back|cancel)(:.*)?$/);
      const text = cbMatch ? null : trimmed;
      const callback = cbMatch ? trimmed : null;

      const [err, output] = await bubble.send(text, callback);
      if (err !== null || output === null) {
        console.log(`\n  ❌ Error: ${err?.message ?? 'null output'}\n`);
        ask();
        return;
      }
      formatResponse(output);
      ask();
    });
  };

  ask();
}

interface BubbleReport {
  readonly chat_id: string;
  readonly input_text: string | null;
  readonly input_callback: string | null;
  readonly output: BubbleOutput;
}

export async function main(rawInput: unknown): Promise<Result<BubbleReport>> {
  const parsed = z.object({
    chat_id: z.string().default('test-user-001'),
    text: z.string().nullable().default(null),
    callback_data: z.string().nullable().default(null),
  }).safeParse(rawInput);

  if (!parsed.success) {
    return [new Error(`Invalid input: ${parsed.error.message}`), null];
  }

  const { chat_id, text, callback_data } = parsed.data;
  const bubble = new TelegramBubble(chat_id);
  const [err, output] = await bubble.send(text, callback_data);
  if (err !== null || output === null) {
    return [err ?? new Error('null output'), null];
  }

  return [null, { chat_id, input_text: text, input_callback: callback_data, output }];
}

// CLI entry point — only runs when this file is executed directly
const isThisFileEntry = process.argv[1]?.endsWith('telegram_bubble/main.ts');

if (isThisFileEntry) {
  const isInteractive = process.argv.includes('--interactive') || process.argv.includes('-i');

  if (isInteractive) {
    void interactiveMode();
  } else {
    const args = process.argv.slice(2);
    const chatIdMatch = args.find(a => a.startsWith('--chat-id='));
    const chatId = chatIdMatch ? chatIdMatch.split('=')[1] : 'test-user-001';
    const message = args.filter(a => !a.startsWith('--')).join(' ');

    if (!message) {
      console.error('Usage: npx tsx f/internal/telegram_bubble/main.ts "your message"');
      console.error('       npx tsx f/internal/telegram_bubble/main.ts --interactive');
      process.exit(1);
    }

    const cbMatch = message.match(/^(spec|doc|time|cfm|menu|back|cancel)(:.*)?$/);
    const text = cbMatch ? null : message;
    const callback = cbMatch ? message : null;

    void main({ chat_id: chatId, text, callback_data: callback }).then(([err, report]) => {
      if (err !== null) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
      if (report !== null) {
        formatResponse(report.output);
      }
      process.exit(0);
    });
  }
}
