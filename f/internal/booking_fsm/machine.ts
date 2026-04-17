/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Implement the FSM transition machine for the booking wizard
 * DB Tables Used  : None — pure state transitions
 * Concurrency Risk: NO
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : YES — all transitions validated against VALID_TRANSITIONS
 */

import {
  BOOKING_STEP,
  type BookingState,
  type BookingAction,
  type TransitionResult,
  type DraftBooking,
  type TransitionOutcome,
  isNamedItemArray,
  isTimeItemArray,
} from './types';
import {
  buildSpecialtyPrompt,
  buildDoctorsPrompt,
  buildSlotsPrompt,
  buildConfirmationPrompt,
  buildLoadingDoctorsPrompt,
  buildLoadingSlotsPrompt,
} from './responses';
import { resolveDate } from '../date-resolver';
import type { Result } from '../result';

// ============================================================================
// Internal Types & Constants
// ============================================================================

type StateHandler = (
  state: any,
  action: BookingAction,
  draft: DraftBooking,
  items?: readonly any[]
) => TransitionResult;

const MAIN_MENU_TEXT = '📱 *Menú Principal*\n\n1️⃣ Agendar cita\n2️⃣ Mis citas\n3️⃣ Recordatorios\n4️⃣ Información';

// ============================================================================
// Type-narrowing helpers
// ============================================================================

function getNamedItems(items: unknown): { id: string; name: string }[] {
  return isNamedItemArray(items) ? items : [];
}

function getTimeItems(items: unknown): { id: string; label: string; start_time: string }[] {
  return isTimeItemArray(items) ? items : [];
}

// ============================================================================
// State builder helpers
// ============================================================================

const stateFactory = {
  idle: (): BookingState => ({ name: BOOKING_STEP.IDLE }),
  selectingSpecialty: (items: { id: string; name: string }[], error?: string | null): BookingState => 
    ({ name: BOOKING_STEP.SELECTING_SPECIALTY, error: error ?? null, items }),
  selectingDoctor: (specialtyId: string, specialtyName: string, items: { id: string; name: string }[], error?: string | null): BookingState => 
    ({ name: BOOKING_STEP.SELECTING_DOCTOR, specialtyId, specialtyName, error: error ?? null, items }),
  selectingTime: (specialtyId: string, doctorId: string, doctorName: string, targetDate: string | null, items: { id: string; label: string; start_time: string }[], error?: string | null): BookingState => 
    ({ name: BOOKING_STEP.SELECTING_TIME, specialtyId, doctorId, doctorName, targetDate, error: error ?? null, items }),
  confirming: (specialtyId: string, doctorId: string, doctorName: string, timeSlot: string, draft: DraftBooking): BookingState => 
    ({ name: BOOKING_STEP.CONFIRMING, specialtyId, doctorId, doctorName, timeSlot, draft }),
  completed: (bookingId: string): BookingState => 
    ({ name: BOOKING_STEP.COMPLETED, bookingId }),
};

// ============================================================================
// Navigation Handlers (DRY)
// ============================================================================

function handleGlobalActions(action: BookingAction): Result<TransitionOutcome> | null {
  if (action.type === 'cancel') {
    return [null, { nextState: stateFactory.idle(), responseText: MAIN_MENU_TEXT, advance: false }];
  }
  return null;
}

// ============================================================================
// Step Handlers (SRP)
// ============================================================================

const handlers: Record<string, StateHandler> = {
  [BOOKING_STEP.IDLE]: (_, action, __, items): TransitionResult => {
    if (action.type === 'select') {
      const specialtyItems = getNamedItems(items);
      if (specialtyItems.length === 0) {
        return [
          new Error('no_specialties_available'),
          { nextState: stateFactory.idle(), responseText: 'No hay especialidades disponibles en este momento.', advance: false }
        ];
      }
      return [null, { 
        nextState: stateFactory.selectingSpecialty(specialtyItems), 
        responseText: buildSpecialtyPrompt(specialtyItems), 
        advance: true 
      }];
    }
    return [
      new Error('invalid_idle_action'),
      { nextState: stateFactory.idle(), responseText: '¿En qué puedo ayudarte?\n\n1️⃣ Agendar cita\n2️⃣ Mis citas\n3️⃣ Recordatorios\n4️⃣ Información', advance: false }
    ];
  },

  [BOOKING_STEP.SELECTING_SPECIALTY]: (state, action): TransitionResult => {
    if (action.type === 'back') return [null, { nextState: stateFactory.idle(), responseText: MAIN_MENU_TEXT, advance: false }];
    
    if (action.type === 'select') {
      const specialtyItems = state.items;
      let specialty = specialtyItems.find((i: any) => i.id === action.value);
      
      if (!specialty && /^\d+$/.test(action.value)) {
        specialty = specialtyItems[parseInt(action.value, 10) - 1];
      }

      if (!specialty) {
        return [
          new Error('invalid_specialty_selection'),
          { 
            nextState: stateFactory.selectingSpecialty(specialtyItems, 'Opción inválida.'), 
            responseText: buildSpecialtyPrompt(specialtyItems, '⚠️ Opción inválida.'), 
            advance: false 
          }
        ];
      }
      return [null, { 
        nextState: stateFactory.selectingDoctor(specialty.id, specialty.name, []), 
        responseText: buildLoadingDoctorsPrompt(specialty.name), 
        advance: true 
      }];
    }
    return [new Error('invalid_action'), { nextState: state, responseText: buildSpecialtyPrompt(state.items), advance: false }];
  },

  [BOOKING_STEP.SELECTING_DOCTOR]: (state, action, _, items): TransitionResult => {
    if (action.type === 'back') {
      const specialtyItems = getNamedItems(items);
      return [null, { nextState: stateFactory.selectingSpecialty(specialtyItems), responseText: buildSpecialtyPrompt(specialtyItems), advance: false }];
    }

    if (action.type === 'select') {
      const doctorItems = isNamedItemArray(state.items) ? state.items : getNamedItems(items);
      let doctor = doctorItems.find((i: { id: string; name: string }) => i.id === action.value);

      if (!doctor && /^\d+$/.test(action.value)) {
        doctor = doctorItems[parseInt(action.value, 10) - 1];
      }

      if (!doctor) {
        return [
          new Error('invalid_doctor_selection'),
          { 
            nextState: stateFactory.selectingDoctor(state.specialtyId, state.specialtyName, doctorItems, 'Opción inválida.'), 
            responseText: buildDoctorsPrompt(state.specialtyName, doctorItems, '⚠️ Opción inválida.'), 
            advance: false 
          }
        ];
      }
      return [null, { 
        nextState: stateFactory.selectingTime(state.specialtyId, doctor.id, doctor.name, null, []), 
        responseText: buildLoadingSlotsPrompt(doctor.name), 
        advance: true 
      }];
    }
    return [new Error('invalid_action'), { nextState: state, responseText: buildDoctorsPrompt(state.specialtyName, getNamedItems(items)), advance: false }];
  },

  [BOOKING_STEP.SELECTING_TIME]: (state, action, draft, items): TransitionResult => {
    if (action.type === 'back') {
      const doctorItems = getNamedItems(items);
      return [null, { nextState: stateFactory.selectingDoctor(state.specialtyId, state.doctorId, doctorItems), responseText: buildDoctorsPrompt('', doctorItems), advance: false }];
    }

    if (action.type === 'select_date') {
      return [null, { 
        nextState: stateFactory.selectingTime(state.specialtyId, state.doctorId, state.doctorName, action.value, []), 
        responseText: `Buscando horarios para el ${action.value}...`, 
        advance: true 
      }];
    }

    if (action.type === 'select') {
      const timeItems = isTimeItemArray(state.items) ? state.items : getTimeItems(items);
      let slot = timeItems.find((i: { start_time: string }) => i.start_time === action.value);

      if (!slot && /^\d+$/.test(action.value)) {
        slot = timeItems[parseInt(action.value, 10) - 1];
      }

      if (!slot) {
        return [
          new Error('invalid_time_selection'),
          { 
            nextState: stateFactory.selectingTime(state.specialtyId, state.doctorId, state.doctorName, state.targetDate, timeItems, 'Opción inválida.'), 
            responseText: buildSlotsPrompt(state.doctorName, timeItems, '⚠️ Opción inválida.'), 
            advance: false 
          }
        ];
      }

      const newDraft: DraftBooking = { 
        ...draft, 
        specialty_id: state.specialtyId, 
        doctor_id: state.doctorId, 
        doctor_name: state.doctorName, 
        start_time: slot.start_time, 
        time_label: slot.label, 
        target_date: state.targetDate 
      };

      return [null, { 
        nextState: stateFactory.confirming(state.specialtyId, state.doctorId, state.doctorName, slot.label, newDraft), 
        responseText: buildConfirmationPrompt(slot.label, state.doctorName), 
        advance: true 
      }];
    }
    return [new Error('invalid_action'), { nextState: state, responseText: buildSlotsPrompt(state.doctorName, getTimeItems(items)), advance: false }];
  },

  [BOOKING_STEP.CONFIRMING]: (state, action, draft, items): TransitionResult => {
    if (action.type === 'confirm_yes') {
      return [null, { 
        nextState: stateFactory.completed('pending'), 
        responseText: '✅ *Reserva Confirmada*\n\nTu cita ha sido agendada correctamente.\nRecibirás un recordatorio antes de tu cita.', 
        advance: true 
      }];
    }

    if (action.type === 'confirm_no' || action.type === 'back') {
      const timeItems = getTimeItems(items);
      return [null, { 
        nextState: stateFactory.selectingTime(state.specialtyId, state.doctorId, state.doctorName, draft.target_date, timeItems), 
        responseText: buildSlotsPrompt(state.doctorName, timeItems), 
        advance: false 
      }];
    }

    return [
      new Error('invalid_confirmation_action'),
      { nextState: state, responseText: buildConfirmationPrompt(state.timeSlot, state.doctorName, '¿Confirmas esta cita? Responde "sí" o "no".'), advance: false }
    ];
  },

  [BOOKING_STEP.COMPLETED]: (): TransitionResult => {
    return [null, { nextState: stateFactory.idle(), responseText: MAIN_MENU_TEXT, advance: false }];
  },
};

// ============================================================================
// Public Interface (Preserved Signatures)
// ============================================================================

export function parseAction(text: string): BookingAction {
  const trimmed = text.trim().toLowerCase();

  if (['volver', 'back', 'atras', 'menu', 'menú', 'inicio'].includes(trimmed)) return { type: 'back' };
  if (['cancelar', 'cancel', 'no quiero'].includes(trimmed)) return { type: 'cancel' };
  if (['si', 'sí', 'yes', 'confirmar', 'confirmo', 'ok', 'dale'].includes(trimmed)) return { type: 'confirm_yes' };
  if (['no', 'nop', 'nope'].includes(trimmed)) return { type: 'confirm_no' };
  if (/^\d+$/.test(trimmed)) return { type: 'select', value: trimmed };

  const parsedDate = resolveDate(trimmed);
  if (parsedDate !== null) return { type: 'select_date', value: parsedDate };

  return { type: 'select', value: trimmed };
}

export function applyTransition(
  currentState: BookingState,
  action: BookingAction,
  draft: DraftBooking,
  items?: readonly { id: string; name: string; label?: string; start_time?: string }[]
): TransitionResult {
  // 1. Handle global escape actions (Cancel)
  const globalResult = handleGlobalActions(action);
  if (globalResult) return globalResult;

  // 2. Delegate to specific step handler
  const handler = handlers[currentState.name];
  if (!handler) {
    return [
      new Error(`unknown_state: ${currentState.name}`),
      { nextState: stateFactory.idle(), responseText: 'Estado desconocido.', advance: false }
    ];
  }

  return handler(currentState, action, draft, items);
}

export const STEP_TO_FLOW_STEP: Readonly<Record<string, number>> = {
  idle: 0,
  selecting_specialty: 1,
  selecting_doctor: 2,
  selecting_time: 3,
  confirming: 4,
  completed: 5,
} as const;

export function flowStepFromState(state: BookingState): number {
  return STEP_TO_FLOW_STEP[state.name] ?? 0;
}

export function parseCallbackData(data: string): BookingAction | null {
  if (data === 'back') return { type: 'back' };
  if (data === 'cancel') return { type: 'cancel' };
  if (data === 'cfm:yes') return { type: 'confirm_yes' };
  if (data === 'cfm:no') return { type: 'confirm_no' };

  const match = /^(spec|doc|time|slot):(.+)$/.exec(data);
  if (match?.[2] !== undefined) return { type: 'select', value: match[2] };

  return null;
}
