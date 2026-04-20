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
  applyTransition,
  emptyDraft,
  type BookingState,
  BOOKING_STEP,
} from '../booking_fsm/index';

describe('Telegram Bubble — wizard back navigation', () => {
  test('selecting_specialty → back → idle', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_SPECIALTY,
      error: null,
      items: [{ id: 's1', name: 'Cardiología' }],
    };
    const [err, outcome] = applyTransition(state, { type: 'back' }, emptyDraft());
    expect(err).toBeNull();
    expect(outcome?.nextState.name).toBe('idle');
  });

  test('selecting_doctor → back → selecting_specialty', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_DOCTOR,
      specialtyId: 's1',
      specialtyName: 'Cardiología',
      error: null,
      items: [{ id: 'd1', name: 'Dr. Pérez' }],
    };
    const [err, outcome] = applyTransition(state, { type: 'back' }, emptyDraft(), []);
    expect(err).toBeNull();
    expect(outcome?.nextState.name).toBe('selecting_specialty');
  });

  test('selecting_time → back → selecting_doctor', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_TIME,
      specialtyId: 's1',
      doctorId: 'd1',
      doctorName: 'Dr. Pérez',
      targetDate: null,
      error: null,
      items: [{ id: 't1', label: '9:00 AM', start_time: '2026-04-13T09:00:00Z' }],
    };
    const [err, outcome] = applyTransition(state, { type: 'back' }, emptyDraft(), []);
    expect(err).toBeNull();
    expect(outcome?.nextState.name).toBe('selecting_doctor');
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
    const [err, outcome] = applyTransition(state, { type: 'back' }, emptyDraft(), []);
    expect(err).toBeNull();
    expect(outcome?.nextState.name).toBe('selecting_time');
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
    const [err, outcome] = applyTransition(state, { type: 'cancel' }, emptyDraft());
    expect(err).toBeNull();
    expect(outcome?.nextState.name).toBe('idle');
    expect(outcome?.responseText).toContain('Menú Principal');
  });
});

describe('Telegram Bubble — invalid inputs', () => {
  test('invalid specialty selection shows error', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_SPECIALTY,
      error: null,
      items: [{ id: 's1', name: 'Cardiología' }],
    };
    const [err, outcome] = applyTransition(state, { type: 'select', value: '99' }, emptyDraft());
    expect(err).not.toBeNull();
    expect(outcome?.responseText).toContain('Opción inválida');
  });

  test('invalid time selection shows error', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_TIME,
      specialtyId: 's1',
      doctorId: 'd1',
      doctorName: 'Dr. Pérez',
      targetDate: null,
      error: null,
      items: [{ id: 't1', label: '9:00 AM', start_time: '2026-04-13T09:00:00Z' }],
    };
    const [err, outcome] = applyTransition(state, { type: 'select', value: '5' }, emptyDraft());
    expect(err).not.toBeNull();
    expect(outcome?.responseText).toContain('Opción inválida');
  });
});
