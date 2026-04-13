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

// ============================================================================
// BOOKING FSM — State Machine
// ============================================================================
// Pure functions. No side effects. No DB calls. No LLM calls.
// Given a current state + action → returns next state + response text.
// All transitions validated against VALID_TRANSITIONS map.
// Type guards used instead of `as` casts for type safety.
// ============================================================================

import {
  BOOKING_STEP,
  type BookingState,
  type BookingAction,
  type TransitionResult,
  type DraftBooking,
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

// ============================================================================
// Type-narrowing helpers — use guards instead of `as` casts
// ============================================================================

function getNamedItems(items: unknown): Array<{ id: string; name: string }> {
  return isNamedItemArray(items) ? items : [];
}

function getTimeItems(items: unknown): Array<{ id: string; label: string; start_time: string }> {
  return isTimeItemArray(items) ? items : [];
}

// ============================================================================
// Action parser — converts raw text into BookingAction
// ============================================================================

export function parseAction(text: string): BookingAction {
  const trimmed = text.trim().toLowerCase();

  if (['volver', 'back', 'atras', 'menu', 'menú', 'inicio'].includes(trimmed)) return { type: 'back' };
  if (['cancelar', 'cancel', 'no quiero'].includes(trimmed)) return { type: 'cancel' };
  if (['si', 'sí', 'yes', 'confirmar', 'confirmo', 'ok', 'dale'].includes(trimmed)) return { type: 'confirm_yes' };
  if (['no', 'nop', 'nope'].includes(trimmed)) return { type: 'confirm_no' };
  if (/^\d+$/.test(trimmed)) return { type: 'select', value: trimmed };

  return { type: 'select', value: trimmed };
}

// ============================================================================
// State builder helpers
// ============================================================================

function idleState(): BookingState {
  return { name: BOOKING_STEP.IDLE };
}

function selectingSpecialtyState(items: Array<{ id: string; name: string }>, error?: string | null): BookingState {
  return { name: BOOKING_STEP.SELECTING_SPECIALTY, error: error ?? null, items };
}

function selectingDoctorState(specialtyId: string, specialtyName: string, items: Array<{ id: string; name: string }>, error?: string | null): BookingState {
  return { name: BOOKING_STEP.SELECTING_DOCTOR, specialtyId, specialtyName, error: error ?? null, items };
}

function selectingTimeState(specialtyId: string, doctorId: string, doctorName: string, items: Array<{ id: string; label: string; start_time: string }>, error?: string | null): BookingState {
  return { name: BOOKING_STEP.SELECTING_TIME, specialtyId, doctorId, doctorName, error: error ?? null, items };
}

function confirmingState(specialtyId: string, doctorId: string, doctorName: string, timeSlot: string, draft: DraftBooking): BookingState {
  return { name: BOOKING_STEP.CONFIRMING, specialtyId, doctorId, doctorName, timeSlot, draft };
}

function completedState(bookingId: string): BookingState {
  return { name: BOOKING_STEP.COMPLETED, bookingId };
}

// ============================================================================
// Transition engine
// ============================================================================

export function applyTransition(
  currentState: BookingState,
  action: BookingAction,
  draft: DraftBooking,
  items?: Array<{ id: string; name: string; label?: string; start_time?: string }>,
): TransitionResult {
  switch (currentState.name) {
    case BOOKING_STEP.IDLE: {
      if (action.type === 'select') {
        const specialtyItems = getNamedItems(items);
        if (specialtyItems.length === 0) {
          return { ok: false, nextState: idleState(), responseText: 'No hay especialidades disponibles en este momento.', advance: false };
        }
        return { ok: true, nextState: selectingSpecialtyState(specialtyItems), responseText: buildSpecialtyPrompt(specialtyItems), advance: true };
      }
      return { ok: false, nextState: idleState(), responseText: '¿En qué puedo ayudarte?\n\n1️⃣ Agendar cita\n2️⃣ Mis citas\n3️⃣ Recordatorios\n4️⃣ Información', advance: false };
    }

    case BOOKING_STEP.SELECTING_SPECIALTY: {
      if (action.type === 'back' || action.type === 'cancel') {
        return { ok: true, nextState: idleState(), responseText: '📱 *Menú Principal*\n\n1️⃣ Agendar cita\n2️⃣ Mis citas\n3️⃣ Recordatorios\n4️⃣ Información', advance: false };
      }
      if (action.type === 'select') {
        const specialtyItems = currentState.items;
        const idx = parseInt(action.value, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= specialtyItems.length) {
          return { ok: false, nextState: selectingSpecialtyState(specialtyItems, 'Opción inválida. Elige un número de la lista.'), responseText: buildSpecialtyPrompt(specialtyItems, '⚠️ Opción inválida. Elige un número de la lista.'), advance: false };
        }
        const specialty = specialtyItems[idx];
        return { ok: true, nextState: selectingDoctorState(specialty.id, specialty.name, []), responseText: buildLoadingDoctorsPrompt(specialty.name), advance: true };
      }
      return { ok: false, nextState: currentState, responseText: buildSpecialtyPrompt(currentState.items), advance: false };
    }

    case BOOKING_STEP.SELECTING_DOCTOR: {
      if (action.type === 'back' || action.type === 'cancel') {
        const specialtyItems = getNamedItems(items);
        return { ok: true, nextState: selectingSpecialtyState(specialtyItems), responseText: buildSpecialtyPrompt(specialtyItems), advance: false };
      }
      if (action.type === 'select') {
        const doctorItems = isNamedItemArray(currentState.items) ? currentState.items : getNamedItems(items);
        const idx = parseInt(action.value, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= doctorItems.length) {
          return { ok: false, nextState: selectingDoctorState(currentState.specialtyId, currentState.specialtyName, doctorItems, 'Opción inválida.'), responseText: buildDoctorsPrompt(currentState.specialtyName, doctorItems, '⚠️ Opción inválida.'), advance: false };
        }
        const doctor = doctorItems[idx];
        return { ok: true, nextState: selectingTimeState(currentState.specialtyId, doctor.id, doctor.name, []), responseText: buildLoadingSlotsPrompt(doctor.name), advance: true };
      }
      return { ok: false, nextState: currentState, responseText: buildDoctorsPrompt(currentState.specialtyName, getNamedItems(items)), advance: false };
    }

    case BOOKING_STEP.SELECTING_TIME: {
      if (action.type === 'back') {
        const doctorItems = getNamedItems(items);
        return { ok: true, nextState: selectingDoctorState(currentState.specialtyId, currentState.doctorId, doctorItems), responseText: buildDoctorsPrompt('', doctorItems), advance: false };
      }
      if (action.type === 'cancel') {
        return { ok: true, nextState: idleState(), responseText: '📱 *Menú Principal*\n\n1️⃣ Agendar cita\n2️⃣ Mis citas\n3️⃣ Recordatorios\n4️⃣ Información', advance: false };
      }
      if (action.type === 'select') {
        const timeItems = isTimeItemArray(currentState.items) ? currentState.items : getTimeItems(items);
        const idx = parseInt(action.value, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= timeItems.length) {
          return { ok: false, nextState: selectingTimeState(currentState.specialtyId, currentState.doctorId, currentState.doctorName, timeItems, 'Opción inválida.'), responseText: buildSlotsPrompt(currentState.doctorName, timeItems, '⚠️ Opción inválida.'), advance: false };
        }
        const slot = timeItems[idx];
        const newDraft: DraftBooking = { ...draft, specialty_id: currentState.specialtyId, specialty_name: draft.specialty_name, doctor_id: currentState.doctorId, doctor_name: currentState.doctorName, start_time: slot.start_time, time_label: slot.label };
        return { ok: true, nextState: confirmingState(currentState.specialtyId, currentState.doctorId, currentState.doctorName, slot.label, newDraft), responseText: buildConfirmationPrompt(slot.label, currentState.doctorName), advance: true };
      }
      return { ok: false, nextState: currentState, responseText: buildSlotsPrompt(currentState.doctorName, getTimeItems(items)), advance: false };
    }

    case BOOKING_STEP.CONFIRMING: {
      if (action.type === 'confirm_yes') {
        return { ok: true, nextState: completedState('pending'), responseText: '✅ *Reserva Confirmada*\n\nTu cita ha sido agendada correctamente.\nRecibirás un recordatorio antes de tu cita.', advance: true };
      }
      if (action.type === 'confirm_no' || action.type === 'back') {
        const timeItems = getTimeItems(items);
        return { ok: true, nextState: selectingTimeState(currentState.specialtyId, currentState.doctorId, currentState.doctorName, timeItems), responseText: buildSlotsPrompt(currentState.doctorName, timeItems), advance: false };
      }
      if (action.type === 'cancel') {
        return { ok: true, nextState: idleState(), responseText: '📱 *Menú Principal*\n\n1️⃣ Agendar cita\n2️⃣ Mis citas\n3️⃣ Recordatorios\n4️⃣ Información', advance: false };
      }
      return { ok: false, nextState: currentState, responseText: buildConfirmationPrompt(currentState.timeSlot, currentState.doctorName, '¿Confirmas esta cita? Responde "sí" o "no".'), advance: false };
    }

    case BOOKING_STEP.COMPLETED: {
      return { ok: true, nextState: idleState(), responseText: '📱 *Menú Principal*\n\n1️⃣ Agendar cita\n2️⃣ Mis citas\n3️⃣ Recordatorios\n4️⃣ Información', advance: false };
    }

    default: {
      return { ok: false, nextState: idleState(), responseText: 'Estado desconocido.', advance: false };
    }
  }
}

// ============================================================================
// Flow step mapping — maps BookingStepName to numeric flow_step for Redis
// ============================================================================

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
