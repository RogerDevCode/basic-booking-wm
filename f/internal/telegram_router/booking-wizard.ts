/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Handle booking wizard steps with inline keyboard responses
 * DB Tables Used  : services, providers, provider_schedules, bookings (via data queries)
 * Concurrency Risk: NO — read-only data queries + stateless FSM transitions
 * GCal Calls      : NO
 * Idempotency Key : NO — read-only state machine transition
 * RLS Tenant ID   : NO — wizard creates its own connection
 * Zod Schemas     : YES — FSM state/action schemas validate all inputs
 */

// ============================================================================
// TELEGRAM ROUTER — Booking Wizard Handler with Inline Keyboard
// ============================================================================
// Called when the router detects a callback_data wizard pattern or text input
// while in an active booking_wizard flow.
// Uses the FSM to determine the current step and process user input.
// Fetches data (specialties/doctors/slots) as needed.
// Returns inline keyboard + text for Telegram editMessageText/sendMessage.
// ============================================================================

import {
  type BookingState,
  type TransitionResult,
  type DraftBooking,
  applyTransition,
  parseAction,
  parseCallbackData,
  flowStepFromState,
  emptyDraft,
  buildSpecialtyKeyboard,
  buildDoctorKeyboard,
  buildTimeSlotKeyboard,
  buildConfirmationKeyboard,
  fetchSpecialties,
  fetchDoctors,
  fetchSlots,
} from '../booking_fsm';
import { createDbClient } from '../db/client';

// ============================================================================
// Wizard handler input/output
// ============================================================================

interface WizardInput {
  readonly text: string;
  readonly callbackData: string | null;
  readonly currentState: BookingState | null;
  readonly draft: DraftBooking;
}

export interface WizardOutput {
  readonly route: 'wizard';
  readonly forward_to_ai: boolean;
  readonly response_text: string;
  readonly inline_keyboard: readonly { readonly text: string; readonly callback_data: string }[][];
  readonly nextState: BookingState;
  readonly nextDraft: DraftBooking;
  readonly nextFlowStep: number;
  readonly advance: boolean;
  readonly should_edit: boolean;  // true = editMessageText, false = sendMessage
}

// ============================================================================
// Main handler
// ============================================================================

export async function handleBookingWizard(input: WizardInput): Promise<[Error | null, WizardOutput | null]> {
  const { text, callbackData, currentState, draft } = input;

  const state: BookingState = currentState ?? { name: 'idle' };
  const currentDraft: DraftBooking = draft ?? emptyDraft();

  // Parse action from callback_data (preferred) or text
  const action = callbackData !== null ? parseCallbackData(callbackData) : parseAction(text);
  if (action === null) {
    return [new Error(`Unrecognized callback_data: ${callbackData ?? text}`), null];
  }

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('DATABASE_URL not configured'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const transition = applyTransition(state, action, currentDraft);
    const result = await fetchDataForState(transition, sql);

    if (result !== null) {
      return [null, result];
    }

    return [null, {
      route: 'wizard',
      forward_to_ai: false,
      response_text: transition.responseText,
      inline_keyboard: [],
      nextState: transition.nextState,
      nextDraft: currentDraft,
      nextFlowStep: flowStepFromState(transition.nextState),
      advance: transition.advance,
      should_edit: state.name !== 'idle',
    }];
  } finally {
    await sql.end().catch(() => { /* ignore */ });
  }
}

// ============================================================================
// Data fetcher — called after FSM transition to populate lists + keyboards
// ============================================================================

async function fetchDataForState(
  transition: TransitionResult,
  sql: ReturnType<typeof createDbClient>,
): Promise<WizardOutput | null> {
  const nextState = transition.nextState;
  const shouldEdit = transition.advance;

  switch (nextState.name) {
    case 'selecting_specialty': {
      const [err, specialtiesResult] = await fetchSpecialties(sql);
      if (err !== null || specialtiesResult === null) {
        return {
          route: 'wizard', forward_to_ai: false, response_text: '⚠️ Error al cargar especialidades. Intenta de nuevo.',
          inline_keyboard: [], nextState, nextDraft: emptyDraft(), nextFlowStep: flowStepFromState(nextState), advance: false, should_edit: false,
        };
      }

      const specialties = specialtiesResult.specialties;
      if (specialties.length === 0) {
        return {
          route: 'wizard', forward_to_ai: false, response_text: 'No hay especialidades disponibles en este momento.',
          inline_keyboard: buildSpecialtyKeyboard([]), nextState: { name: 'idle' }, nextDraft: emptyDraft(), nextFlowStep: 0, advance: false, should_edit: false,
        };
      }

      return {
        route: 'wizard', forward_to_ai: false,
        response_text: '📅 *Paso 1:* Selecciona la especialidad:',
        inline_keyboard: buildSpecialtyKeyboard(specialties),
        nextState: { ...nextState, items: [...specialties] },
        nextDraft: emptyDraft(),
        nextFlowStep: flowStepFromState(nextState),
        advance: transition.advance,
        should_edit: shouldEdit,
      };
    }

    case 'selecting_doctor': {
      const specialtyName = nextState.specialtyName;
      const [err, doctorsResult] = await fetchDoctors(sql, specialtyName);
      if (err !== null || doctorsResult === null) {
        return {
          route: 'wizard', forward_to_ai: false, response_text: '⚠️ Error al cargar doctores. Intenta de nuevo.',
          inline_keyboard: [], nextState, nextDraft: emptyDraft(), nextFlowStep: flowStepFromState(nextState), advance: false, should_edit: false,
        };
      }

      const doctors = doctorsResult.doctors;
      if (doctors.length === 0) {
        return {
          route: 'wizard', forward_to_ai: false, response_text: `No hay doctores disponibles en *${specialtyName}*.`,
          inline_keyboard: [], nextState: { name: 'idle' }, nextDraft: emptyDraft(), nextFlowStep: 0, advance: false, should_edit: false,
        };
      }

      return {
        route: 'wizard', forward_to_ai: false,
        response_text: `👨\u200d⚕️ *Paso 2:* Selecciona el doctor en *${specialtyName}*`,
        inline_keyboard: buildDoctorKeyboard(doctors),
        nextState: { ...nextState, items: [...doctors] },
        nextDraft: emptyDraft(),
        nextFlowStep: flowStepFromState(nextState),
        advance: transition.advance,
        should_edit: shouldEdit,
      };
    }

    case 'selecting_time': {
      const { doctorId, doctorName } = nextState;
      const today = new Date().toISOString().split('T')[0];
      const [err, slotsResult] = await fetchSlots(sql, doctorId, today!);
      if (err !== null || slotsResult === null) {
        return {
          route: 'wizard', forward_to_ai: false, response_text: '⚠️ Error al cargar horarios. Intenta de nuevo.',
          inline_keyboard: [], nextState, nextDraft: emptyDraft(), nextFlowStep: flowStepFromState(nextState), advance: false, should_edit: false,
        };
      }

      const slots = slotsResult.slots;
      if (slots.length === 0) {
        return {
          route: 'wizard', forward_to_ai: false, response_text: `No hay horarios disponibles con *${doctorName}* hoy.`,
          inline_keyboard: [], nextState, nextDraft: emptyDraft(), nextFlowStep: flowStepFromState(nextState), advance: false, should_edit: false,
        };
      }

      return {
        route: 'wizard', forward_to_ai: false,
        response_text: `🕐 *Paso 3:* Selecciona el horario con *${doctorName}*`,
        inline_keyboard: buildTimeSlotKeyboard(slots),
        nextState: { ...nextState, items: [...slots] },
        nextDraft: emptyDraft(),
        nextFlowStep: flowStepFromState(nextState),
        advance: transition.advance,
        should_edit: shouldEdit,
      };
    }

    case 'confirming': {
      return {
        route: 'wizard', forward_to_ai: false,
        response_text: `📋 *Paso 4:* Confirmar Cita\n\n${nextState.timeSlot}\n¿Confirmas esta cita?`,
        inline_keyboard: buildConfirmationKeyboard(),
        nextState,
        nextDraft: {
          specialty_id: nextState.specialtyId,
          specialty_name: null,
          doctor_id: nextState.doctorId,
          doctor_name: nextState.doctorName,
          start_time: null,
          time_label: nextState.timeSlot,
          client_id: null,
        },
        nextFlowStep: flowStepFromState(nextState),
        advance: transition.advance,
        should_edit: shouldEdit,
      };
    }

    case 'completed': {
      return {
        route: 'wizard', forward_to_ai: false,
        response_text: '✅ *Reserva Confirmada*\n\nTu cita ha sido agendada correctamente.',
        inline_keyboard: [],
        nextState,
        nextDraft: emptyDraft(),
        nextFlowStep: flowStepFromState(nextState),
        advance: true,
        should_edit: shouldEdit,
      };
    }

    default: {
      return null;
    }
  }
}
