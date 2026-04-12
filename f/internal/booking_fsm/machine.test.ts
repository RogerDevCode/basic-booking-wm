/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Unit tests for the booking FSM state machine
 * DB Tables Used  : None — pure state transition tests
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
  BOOKING_STEP,
  type BookingState,
  type DraftBooking,
} from '../booking_fsm';

describe('parseAction', () => {
  test('parses numeric selection', () => {
    expect(parseAction('1')).toEqual({ type: 'select', value: '1' });
    expect(parseAction(' 3 ')).toEqual({ type: 'select', value: '3' });
  });
  test('parses back/navigation', () => {
    expect(parseAction('volver')).toEqual({ type: 'back' });
    expect(parseAction('atras')).toEqual({ type: 'back' });
  });
  test('parses confirmation yes', () => {
    expect(parseAction('si')).toEqual({ type: 'confirm_yes' });
    expect(parseAction('sí')).toEqual({ type: 'confirm_yes' });
  });
  test('parses confirmation no', () => {
    expect(parseAction('no')).toEqual({ type: 'confirm_no' });
  });
  test('parses cancel', () => {
    expect(parseAction('cancelar')).toEqual({ type: 'cancel' });
  });
});

describe('flowStepFromState', () => {
  test('returns correct step for each state', () => {
    expect(flowStepFromState({ name: BOOKING_STEP.IDLE })).toBe(0);
    expect(flowStepFromState({ name: BOOKING_STEP.SELECTING_SPECIALTY, error: null, items: [] })).toBe(1);
    expect(flowStepFromState({ name: BOOKING_STEP.SELECTING_DOCTOR, specialtyId: '1', specialtyName: 'Card', error: null, items: [] })).toBe(2);
    expect(flowStepFromState({ name: BOOKING_STEP.SELECTING_TIME, specialtyId: '1', doctorId: '1', doctorName: 'Dr', error: null, items: [] })).toBe(3);
    expect(flowStepFromState({ name: BOOKING_STEP.CONFIRMING, specialtyId: '1', doctorId: '1', doctorName: 'Dr', timeSlot: '9:00', draft: emptyDraft() })).toBe(4);
    expect(flowStepFromState({ name: BOOKING_STEP.COMPLETED, bookingId: 'b1' })).toBe(5);
  });
});

describe('applyTransition — transitions', () => {
  const draft = emptyDraft();

  test('idle → selecting_specialty (with mock items)', () => {
    const state: BookingState = { name: BOOKING_STEP.IDLE };
    const result = applyTransition(state, { type: 'select', value: '1' }, draft, [
      { id: 's1', name: 'Cardiología' },
    ]);
    expect(result.ok).toBe(true);
    expect(result.nextState.name).toBe('selecting_specialty');
    expect(result.advance).toBe(true);
  });

  test('selecting_specialty → selecting_doctor', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_SPECIALTY,
      error: null,
      items: [{ id: 's1', name: 'Cardiología' }],
    };
    const result = applyTransition(state, { type: 'select', value: '1' }, draft, [
      { id: 'd1', name: 'Dr. Pérez' },
    ]);
    expect(result.ok).toBe(true);
    expect(result.nextState.name).toBe('selecting_doctor');
    expect((result.nextState as any).specialtyId).toBe('s1');
  });

  test('selecting_specialty → back → idle', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_SPECIALTY,
      error: null,
      items: [{ id: 's1', name: 'Cardiología' }],
    };
    const result = applyTransition(state, { type: 'back' }, draft, []);
    expect(result.ok).toBe(true);
    expect(result.nextState.name).toBe('idle');
  });

  test('selecting_specialty → invalid → error', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_SPECIALTY,
      error: null,
      items: [{ id: 's1', name: 'Cardiología' }],
    };
    const result = applyTransition(state, { type: 'select', value: '5' }, draft, []);
    expect(result.ok).toBe(false);
    expect(result.responseText).toContain('Opción inválida');
  });

  test('selecting_doctor → selecting_time', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_DOCTOR,
      specialtyId: 's1',
      specialtyName: 'Cardiología',
      error: null,
      items: [{ id: 'd1', name: 'Dr. Pérez' }],
    };
    const result = applyTransition(state, { type: 'select', value: '1' }, draft, [
      { id: 't1', label: '9:00 AM', start_time: '2026-04-13T09:00:00Z' },
    ]);
    expect(result.ok).toBe(true);
    expect(result.nextState.name).toBe('selecting_time');
  });

  test('selecting_time → confirming', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_TIME,
      specialtyId: 's1',
      doctorId: 'd1',
      doctorName: 'Dr. Pérez',
      error: null,
      items: [{ id: 't1', label: '9:00 AM', start_time: '2026-04-13T09:00:00Z' }],
    };
    const result = applyTransition(state, { type: 'select', value: '1' }, draft);
    expect(result.ok).toBe(true);
    expect(result.nextState.name).toBe('confirming');
    expect((result.nextState as any).timeSlot).toBe('9:00 AM');
  });

  test('confirming → confirm_yes → completed', () => {
    const state: BookingState = {
      name: BOOKING_STEP.CONFIRMING,
      specialtyId: 's1',
      doctorId: 'd1',
      doctorName: 'Dr. Pérez',
      timeSlot: '9:00 AM',
      draft: emptyDraft(),
    };
    const result = applyTransition(state, { type: 'confirm_yes' }, draft);
    expect(result.ok).toBe(true);
    expect(result.nextState.name).toBe('completed');
    expect(result.responseText).toContain('Reserva Confirmada');
  });

  test('confirming → confirm_no → selecting_time', () => {
    const state: BookingState = {
      name: BOOKING_STEP.CONFIRMING,
      specialtyId: 's1',
      doctorId: 'd1',
      doctorName: 'Dr. Pérez',
      timeSlot: '9:00 AM',
      draft: emptyDraft(),
    };
    const result = applyTransition(state, { type: 'confirm_no' }, draft, [
      { id: 't1', label: '9:00 AM', start_time: '2026-04-13T09:00:00Z' },
    ]);
    expect(result.ok).toBe(true);
    expect(result.nextState.name).toBe('selecting_time');
  });

  test('completed → idle', () => {
    const state: BookingState = { name: BOOKING_STEP.COMPLETED, bookingId: 'b1' };
    const result = applyTransition(state, { type: 'select', value: '1' }, draft);
    expect(result.ok).toBe(true);
    expect(result.nextState.name).toBe('idle');
  });
});

describe('applyTransition — draft accumulation', () => {
  const draft = emptyDraft();

  test('selecting_time → confirming: draft is populated', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_TIME,
      specialtyId: 's1',
      doctorId: 'd1',
      doctorName: 'Dr. Pérez',
      error: null,
      items: [{ id: 't1', label: '9:00 AM', start_time: '2026-04-13T09:00:00Z' }],
    };
    const result = applyTransition(state, { type: 'select', value: '1' }, draft);
    expect(result.ok).toBe(true);
    const confirmingState = result.nextState as any;
    expect(confirmingState.draft.specialty_id).toBe('s1');
    expect(confirmingState.draft.doctor_id).toBe('d1');
    expect(confirmingState.draft.start_time).toBe('2026-04-13T09:00:00Z');
    expect(confirmingState.draft.time_label).toBe('9:00 AM');
  });
});

describe('applyTransition — error handling', () => {
  const draft = emptyDraft();

  test('idle with no specialty items → error', () => {
    const state: BookingState = { name: BOOKING_STEP.IDLE };
    const result = applyTransition(state, { type: 'select', value: '1' }, draft, []);
    expect(result.ok).toBe(false);
    expect(result.responseText).toContain('No hay especialidades');
  });

  test('selecting_time with invalid slot → error', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_TIME,
      specialtyId: 's1',
      doctorId: 'd1',
      doctorName: 'Dr. Pérez',
      error: null,
      items: [{ id: 't1', label: '9:00 AM', start_time: '2026-04-13T09:00:00Z' }],
    };
    const result = applyTransition(state, { type: 'select', value: '99' }, draft);
    expect(result.ok).toBe(false);
    expect(result.responseText).toContain('Opción inválida');
  });
});
