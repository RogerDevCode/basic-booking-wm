/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Bubble tests simulating complete wizard conversations
 * DB Tables Used  : None — pure FSM simulation
 * Concurrency Risk: NO
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : YES
 */

import { describe, test, expect } from 'vitest';
import {
  parseAction,
  applyTransition,
  flowStepFromState,
  emptyDraft,
  type BookingState,
  type DraftBooking,
  BOOKING_STEP,
} from '../booking_fsm';

describe('Telegram Bubble — wizard back navigation', () => {
  test('selecting_specialty → back → idle', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_SPECIALTY,
      error: null,
      items: [{ id: 's1', name: 'Cardiología' }],
    };
    const result = applyTransition(state, { type: 'back' }, emptyDraft());
    expect(result.ok).toBe(true);
    expect(result.nextState.name).toBe('idle');
  });

  test('selecting_doctor → back → selecting_specialty', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_DOCTOR,
      specialtyId: 's1',
      specialtyName: 'Cardiología',
      error: null,
      items: [{ id: 'd1', name: 'Dr. Pérez' }],
    };
    const result = applyTransition(state, { type: 'back' }, emptyDraft(), []);
    expect(result.ok).toBe(true);
    expect(result.nextState.name).toBe('selecting_specialty');
  });

  test('selecting_time → back → selecting_doctor', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_TIME,
      specialtyId: 's1',
      doctorId: 'd1',
      doctorName: 'Dr. Pérez',
      error: null,
      items: [{ id: 't1', label: '9:00 AM', start_time: '2026-04-13T09:00:00Z' }],
    };
    const result = applyTransition(state, { type: 'back' }, emptyDraft(), []);
    expect(result.ok).toBe(true);
    expect(result.nextState.name).toBe('selecting_doctor');
  });

  test('confirming → back → selecting_time', () => {
    const state: BookingState = {
      name: BOOKING_STEP.CONFIRMING,
      specialtyId: 's1',
      doctorId: 'd1',
      doctorName: 'Dr. Pérez',
      timeSlot: '9:00 AM',
      draft: emptyDraft(),
    };
    const result = applyTransition(state, { type: 'back' }, emptyDraft(), []);
    expect(result.ok).toBe(true);
    expect(result.nextState.name).toBe('selecting_time');
  });

  test('cancel from confirming → idle', () => {
    const state: BookingState = {
      name: BOOKING_STEP.CONFIRMING,
      specialtyId: 's1',
      doctorId: 'd1',
      doctorName: 'Dr. Pérez',
      timeSlot: '9:00 AM',
      draft: emptyDraft(),
    };
    const result = applyTransition(state, { type: 'cancel' }, emptyDraft());
    expect(result.ok).toBe(true);
    expect(result.nextState.name).toBe('idle');
    expect(result.responseText).toContain('Menú Principal');
  });
});

describe('Telegram Bubble — invalid inputs', () => {
  test('invalid specialty selection shows error', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_SPECIALTY,
      error: null,
      items: [{ id: 's1', name: 'Cardiología' }],
    };
    const result = applyTransition(state, { type: 'select', value: '99' }, emptyDraft());
    expect(result.ok).toBe(false);
    expect(result.responseText).toContain('Opción inválida');
  });

  test('invalid time selection shows error', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_TIME,
      specialtyId: 's1',
      doctorId: 'd1',
      doctorName: 'Dr. Pérez',
      error: null,
      items: [{ id: 't1', label: '9:00 AM', start_time: '2026-04-13T09:00:00Z' }],
    };
    const result = applyTransition(state, { type: 'select', value: '5' }, emptyDraft());
    expect(result.ok).toBe(false);
    expect(result.responseText).toContain('Opción inválida');
  });
});
