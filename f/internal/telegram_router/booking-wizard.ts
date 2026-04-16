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
import { todayYMD } from '../date-resolver';
import { logger } from '../logger';

const MODULE = 'wizard_handler';

// ============================================================================
// Wizard handler input/output
// ============================================================================

interface WizardInput {
  readonly text: string;
  readonly callbackData: string | null;
  readonly currentState: BookingState | null;
  readonly draft: DraftBooking;
  readonly chatId: string;
  readonly userName: string;
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

  logger.info(MODULE, 'Handling wizard step', {
    chatId: input.chatId,
    currentState: currentState?.name ?? 'idle',
    callbackData,
    text
  });

  const state: BookingState = currentState ?? { name: 'idle' };
  const currentDraft: DraftBooking = draft ?? emptyDraft();

  // Parse action from callback_data (preferred) or text
  const action = callbackData !== null ? parseCallbackData(callbackData) : parseAction(text);
  if (action === null) {
    logger.warn(MODULE, 'Could not parse action from input', { text, callbackData });
    return [new Error(`Unrecognized callback_data: ${callbackData ?? text}`), null];
  }

  logger.debug(MODULE, 'Parsed action', { actionType: action.type });

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('DATABASE_URL not configured'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    let preFetchedItems: readonly { id: string; name: string }[] | undefined = undefined;
    if (state.name === 'idle' && action.type === 'select') {
      const [err, specRes] = await fetchSpecialties(sql);
      if (err === null && specRes !== null) {
        preFetchedItems = specRes.specialties;
      }
    }

    const transition = applyTransition(state, action, currentDraft, preFetchedItems);
    logger.info(MODULE, 'Transition applied', { nextState: transition.nextState.name, ok: transition.ok });

    // 2. Fetch data based on the transition result
    // We only fetch data if the transition was valid (transition.ok)
    if (!transition.ok) {
      logger.info(MODULE, 'Wizard step complete (invalid transition)', { nextState: transition.nextState.name });
      return [null, {
        route: 'wizard',
        forward_to_ai: false,
        response_text: transition.responseText,
        inline_keyboard: [],
        nextState: transition.nextState,
        nextDraft: currentDraft,
        nextFlowStep: flowStepFromState(transition.nextState),
        advance: false,
        should_edit: state.name !== 'idle',
      }];
    }

    // Use the draft from the transition if available (it carries the latest selections)
    let nextDraft = currentDraft;
    if (transition.nextState.name === 'confirming' && 'draft' in transition.nextState) {
      nextDraft = transition.nextState.draft as DraftBooking;
    } else if (transition.nextState.name === 'completed') {
      // For completed, we usually want to keep the draft that was used to create the booking
      nextDraft = currentDraft;
    }

    const result = await fetchDataForState(transition, nextDraft, sql, input.chatId, input.userName);

    if (result !== null) {
      logger.info(MODULE, 'Wizard step complete (with data)', { nextState: result.nextState.name });
      return [null, result];
    }

    logger.info(MODULE, 'Wizard step complete (no data)', { nextState: transition.nextState.name });
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
  currentDraft: DraftBooking,
  sql: ReturnType<typeof createDbClient>,
  chatId: string,
  userName: string,
): Promise<WizardOutput | null> {
  const nextState = transition.nextState;
  const shouldEdit = transition.advance;

  try {
    switch (nextState.name) {
    case 'idle':
      return null;
    case 'selecting_specialty': {
      const [err, specialtiesResult] = await fetchSpecialties(sql);
      if (err !== null || specialtiesResult === null) {
        return {
          route: 'wizard', forward_to_ai: false, response_text: '⚠️ Error al cargar especialidades. Intenta de nuevo.',
          inline_keyboard: [], nextState, nextDraft: currentDraft, nextFlowStep: flowStepFromState(nextState), advance: false, should_edit: false,
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
        nextDraft: { ...currentDraft, specialty_id: null, specialty_name: null, doctor_id: null, doctor_name: null, start_time: null, target_date: currentDraft.target_date },
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
          inline_keyboard: [], nextState, nextDraft: currentDraft, nextFlowStep: flowStepFromState(nextState), advance: false, should_edit: false,
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
        nextDraft: { ...currentDraft, specialty_id: nextState.specialtyId, specialty_name: nextState.specialtyName, doctor_id: null, doctor_name: null, start_time: null, target_date: currentDraft.target_date },
        nextFlowStep: flowStepFromState(nextState),
        advance: transition.advance,
        should_edit: shouldEdit,
      };
    }

    case 'selecting_time': {
      const { doctorId, doctorName, targetDate } = nextState;
      // Use explicit selected date or fallback to today
      const dateToFetch = targetDate ?? currentDraft.target_date ?? todayYMD();
      const [err, slotsResult] = await fetchSlots(sql, doctorId, dateToFetch);
      if (err !== null || slotsResult === null) {
        return {
          route: 'wizard', forward_to_ai: false, response_text: '⚠️ Error al cargar horarios. Intenta de nuevo.',
          inline_keyboard: [], nextState, nextDraft: currentDraft, nextFlowStep: flowStepFromState(nextState), advance: false, should_edit: false,
        };
      }

      const slots = slotsResult.slots;
      if (slots.length === 0) {
        return {
          route: 'wizard', forward_to_ai: false, response_text: `No hay horarios disponibles con *${doctorName}* el ${dateToFetch}.`,
          inline_keyboard: [], nextState, nextDraft: { ...currentDraft, target_date: dateToFetch }, nextFlowStep: flowStepFromState(nextState), advance: false, should_edit: false,
        };
      }

      return {
        route: 'wizard', forward_to_ai: false,
        response_text: `🕐 *Paso 3:* Selecciona el horario con *${doctorName}* para el ${dateToFetch}`,
        inline_keyboard: buildTimeSlotKeyboard(slots),
        nextState: { ...nextState, items: [...slots], targetDate: dateToFetch },
        nextDraft: { ...currentDraft, doctor_id: nextState.doctorId, doctor_name: nextState.doctorName, target_date: dateToFetch },
        nextFlowStep: flowStepFromState(nextState),
        advance: transition.advance,
        should_edit: shouldEdit,
      };
    }

    case 'confirming': {
      const draftFromState = nextState.draft;
      return {
        route: 'wizard', forward_to_ai: false,
        response_text: `📋 *Paso 4:* Confirmar Cita\n\n${nextState.timeSlot}\n¿Confirmas esta cita?`,
        inline_keyboard: buildConfirmationKeyboard(),
        nextState,
        nextDraft: draftFromState as DraftBooking,
        nextFlowStep: flowStepFromState(nextState),
        advance: transition.advance,
        should_edit: shouldEdit,
      };
    }

    case 'completed': {
      const { doctor_id, specialty_id, start_time } = currentDraft;
      if (!doctor_id || !specialty_id || !start_time) {
         return {
            route: 'wizard', forward_to_ai: false,
            response_text: '⚠️ Faltan datos para confirmar la reserva. Por favor intenta de nuevo.',
            inline_keyboard: [], nextState: { name: 'idle' }, nextDraft: emptyDraft(), nextFlowStep: 0, advance: false, should_edit: false
         };
      }

      // 1. Look up client by telegram_chat_id
      const clientRows = await sql`
        SELECT client_id FROM clients WHERE telegram_chat_id = ${chatId} LIMIT 1
      `;
      let clientId: string;
      const existingClient = clientRows[0];
      if (!existingClient) {
        const insertRows = await sql`
          INSERT INTO clients (name, telegram_chat_id)
          VALUES (${userName}, ${chatId})
          RETURNING client_id
        `;
        const insertedClient = insertRows[0];
        if (!insertedClient || typeof insertedClient['client_id'] !== 'string') {
          return {
            route: 'wizard', forward_to_ai: false,
            response_text: '⚠️ Error al registrar paciente. Por favor contacta soporte.',
            inline_keyboard: [], nextState: { name: 'idle' }, nextDraft: emptyDraft(), nextFlowStep: 0, advance: false, should_edit: false
          };
        }
        clientId = insertedClient['client_id'];
      } else {
        if (typeof existingClient['client_id'] !== 'string') {
          return {
            route: 'wizard', forward_to_ai: false,
            response_text: '⚠️ Error de datos de paciente. Por favor contacta soporte.',
            inline_keyboard: [], nextState: { name: 'idle' }, nextDraft: emptyDraft(), nextFlowStep: 0, advance: false, should_edit: false
          };
        }
        clientId = existingClient['client_id'];
      }

      const idempotencyKey = `tg_wizard_${clientId}_${doctor_id}_${start_time}`;
      const startTimeDate = new Date(start_time);

      logger.debug(MODULE, 'Importing booking_create');
      let createBooking;
      try {
        const module = await import('../../booking_create/main');
        createBooking = module.main;
      } catch (importErr) {
        logger.error(MODULE, 'Failed to import booking_create', importErr);
        throw importErr;
      }

      const [err, bookingResult] = await createBooking({
        client_id: clientId,
        provider_id: doctor_id,
        service_id: specialty_id,
        start_time: startTimeDate,
        idempotency_key: idempotencyKey,
        actor: 'client',
        channel: 'telegram',
      });

      if (err !== null || bookingResult === null) {
        return {
           route: 'wizard', forward_to_ai: false,
           response_text: `❌ Error al agendar: ${err?.message ?? 'Por favor, intenta nuevamente.'}`,
           inline_keyboard: [], nextState, nextDraft: emptyDraft(), nextFlowStep: flowStepFromState(nextState), advance: false, should_edit: false
        };
      }

      return {
        route: 'wizard', forward_to_ai: false,
        response_text: `✅ *Reserva Confirmada*\n\nTu cita ha sido agendada correctamente. ID: \`${bookingResult.booking_id}\``,
        inline_keyboard: [],
        nextState,
        nextDraft: emptyDraft(),
        nextFlowStep: flowStepFromState(nextState),
        advance: true,
        should_edit: shouldEdit,
      };
    }
    default: {
      const stateName = (nextState as { name?: string }).name ?? 'unknown';
      logger.warn(MODULE, 'Unhandled state in fetchDataForState', { nextStateName: stateName });
      return null;
    }
  }
  } catch (e) {
    logger.error(MODULE, 'fetchDataForState fatal error', e);
    return {
      route: 'wizard', forward_to_ai: false,
      response_text: '⚠️ Ocurrió un error crítico al procesar tu solicitud.',
      inline_keyboard: [], nextState: { name: 'idle' }, nextDraft: emptyDraft(), nextFlowStep: 0, advance: false, should_edit: false
    };
  }
}
