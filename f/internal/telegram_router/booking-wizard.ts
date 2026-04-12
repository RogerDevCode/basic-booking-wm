/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Handle booking wizard steps from within the Telegram router
 * DB Tables Used  : services, providers, provider_schedules, bookings (via data queries)
 * Concurrency Risk: NO — read-only data queries + stateless FSM transitions
 * GCal Calls      : NO
 * Idempotency Key : NO — read-only state machine transition
 * RLS Tenant ID   : NO — wizard creates its own connection (no RLS needed for read-only)
 * Zod Schemas     : YES — FSM state/action schemas validate all inputs
 */

// ============================================================================
// TELEGRAM ROUTER — Booking Wizard Handler
// ============================================================================

import {
  type BookingState,
  type TransitionResult,
  type DraftBooking,
  applyTransition,
  parseAction,
  flowStepFromState,
  emptyDraft,
  buildSpecialtyPrompt,
  buildDoctorsPrompt,
  buildSlotsPrompt,
  buildConfirmationPrompt,
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
  readonly currentState: BookingState | null;
  readonly draft: DraftBooking;
}

export interface WizardOutput {
  readonly route: 'wizard';
  readonly forward_to_ai: boolean;
  readonly response_text: string;
  readonly nextState: BookingState;
  readonly nextDraft: DraftBooking;
  readonly nextFlowStep: number;
  readonly advance: boolean;
}

// ============================================================================
// Main handler
// ============================================================================

export async function handleBookingWizard(input: WizardInput): Promise<[Error | null, WizardOutput | null]> {
  const { text, currentState, draft } = input;

  const state: BookingState = currentState ?? { name: 'idle' };
  const currentDraft: DraftBooking = draft ?? emptyDraft();
  const action = parseAction(text);
  const transition = applyTransition(state, action, currentDraft);

  // Create DB connection for data fetching
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('DATABASE_URL not configured'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const result = await fetchDataForState(transition, sql);

    if (result !== null) {
      return [null, result];
    }

    return [null, {
      route: 'wizard',
      forward_to_ai: false,
      response_text: transition.responseText,
      nextState: transition.nextState,
      nextDraft: currentDraft,
      nextFlowStep: flowStepFromState(transition.nextState),
      advance: transition.advance,
    }];
  } finally {
    await sql.end().catch(() => { /* ignore */ });
  }
}

// ============================================================================
// Data fetcher — called after FSM transition to populate lists
// ============================================================================

async function fetchDataForState(
  transition: TransitionResult,
  sql: ReturnType<typeof createDbClient>,
): Promise<WizardOutput | null> {
  const nextState = transition.nextState;

  switch (nextState.name) {
    case 'selecting_specialty': {
      const [err, specialtiesResult] = await fetchSpecialties(sql);
      if (err !== null || specialtiesResult === null) {
        return {
          route: 'wizard',
          forward_to_ai: false,
          response_text: '⚠️ Error al cargar especialidades. Intenta de nuevo.',
          nextState,
          nextDraft: emptyDraft(),
          nextFlowStep: flowStepFromState(nextState),
          advance: false,
        };
      }

      const specialties = specialtiesResult.specialties;
      if (specialties.length === 0) {
        return {
          route: 'wizard',
          forward_to_ai: false,
          response_text: 'No hay especialidades disponibles en este momento.',
          nextState: { name: 'idle' },
          nextDraft: emptyDraft(),
          nextFlowStep: 0,
          advance: false,
        };
      }

      return {
        route: 'wizard',
        forward_to_ai: false,
        response_text: buildSpecialtyPrompt(specialties),
        nextState: { ...nextState, items: [...specialties] },
        nextDraft: emptyDraft(),
        nextFlowStep: flowStepFromState(nextState),
        advance: transition.advance,
      };
    }

    case 'selecting_doctor': {
      const specialtyName = nextState.specialtyName;
      const [err, doctorsResult] = await fetchDoctors(sql, specialtyName);
      if (err !== null || doctorsResult === null) {
        return {
          route: 'wizard',
          forward_to_ai: false,
          response_text: '⚠️ Error al cargar doctores. Intenta de nuevo.',
          nextState,
          nextDraft: emptyDraft(),
          nextFlowStep: flowStepFromState(nextState),
          advance: false,
        };
      }

      const doctors = doctorsResult.doctors;
      if (doctors.length === 0) {
        return {
          route: 'wizard',
          forward_to_ai: false,
          response_text: `No hay doctores disponibles en *${specialtyName}*.`,
          nextState: { name: 'idle' },
          nextDraft: emptyDraft(),
          nextFlowStep: 0,
          advance: false,
        };
      }

      return {
        route: 'wizard',
        forward_to_ai: false,
        response_text: buildDoctorsPrompt(specialtyName, doctors),
        nextState: { ...nextState, items: [...doctors] },
        nextDraft: emptyDraft(),
        nextFlowStep: flowStepFromState(nextState),
        advance: transition.advance,
      };
    }

    case 'selecting_time': {
      const { doctorId, doctorName } = nextState;
      const today = new Date().toISOString().split('T')[0];
      const [err, slotsResult] = await fetchSlots(sql, doctorId, today);
      if (err !== null || slotsResult === null) {
        return {
          route: 'wizard',
          forward_to_ai: false,
          response_text: '⚠️ Error al cargar horarios. Intenta de nuevo.',
          nextState,
          nextDraft: emptyDraft(),
          nextFlowStep: flowStepFromState(nextState),
          advance: false,
        };
      }

      const slots = slotsResult.slots;
      if (slots.length === 0) {
        return {
          route: 'wizard',
          forward_to_ai: false,
          response_text: `No hay horarios disponibles con *${doctorName}* hoy.`,
          nextState,
          nextDraft: emptyDraft(),
          nextFlowStep: flowStepFromState(nextState),
          advance: false,
        };
      }

      return {
        route: 'wizard',
        forward_to_ai: false,
        response_text: buildSlotsPrompt(doctorName, slots),
        nextState: { ...nextState, items: [...slots] },
        nextDraft: emptyDraft(),
        nextFlowStep: flowStepFromState(nextState),
        advance: transition.advance,
      };
    }

    case 'confirming': {
      return {
        route: 'wizard',
        forward_to_ai: false,
        response_text: buildConfirmationPrompt(nextState.timeSlot, nextState.doctorName),
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
      };
    }

    case 'completed': {
      return {
        route: 'wizard',
        forward_to_ai: false,
        response_text: '✅ *Reserva Confirmada*\n\nTu cita ha sido agendada correctamente.',
        nextState,
        nextDraft: emptyDraft(),
        nextFlowStep: flowStepFromState(nextState),
        advance: true,
      };
    }

    default: {
      return null;
    }
  }
}
