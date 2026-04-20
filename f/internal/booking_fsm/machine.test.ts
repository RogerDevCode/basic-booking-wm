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
  type BookingAction,
  type TransitionResult,
} from '../booking_fsm/index';

// ============================================================================
// HELPERS & MOCKS
// ============================================================================

const DRAFT = emptyDraft();

const MOCK_SPECIALTIES = [{ id: 's1', name: 'Cardiología' }];
const MOCK_DOCTORS = [{ id: 'd1', name: 'Dr. Pérez' }];
const MOCK_SLOTS = [{ id: 't1', label: '9:00 AM', start_time: '2026-04-13T09:00:00Z' }];

/**
 * Helper to reduce boilerplate when testing transitions.
 */
function testTransition(
  state: BookingState,
  action: BookingAction,
  items: any[] = []
): TransitionResult {
  return applyTransition(state, action, DRAFT, items);
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('parseAction', () => {
  test('parses numeric selection', () => {
    expect(parseAction('1')).toEqual({ type: 'select', value: '1' });
    expect(parseAction(' 3 ')).toEqual({ type: 'select', value: '3' });
  });

  test('parses back/navigation', () => {
    expect(parseAction('volver')).toEqual({ type: 'back' });
    expect(parseAction('atras')).toEqual({ type: 'back' });
  });

  test('parses confirmation yes/no', () => {
    expect(parseAction('si')).toEqual({ type: 'confirm_yes' });
    expect(parseAction('sí')).toEqual({ type: 'confirm_yes' });
    expect(parseAction('no')).toEqual({ type: 'confirm_no' });
  });

  test('parses cancel', () => {
    expect(parseAction('cancelar')).toEqual({ type: 'cancel' });
  });
});

describe('flowStepFromState', () => {
  test('returns correct step for each state (linear progression)', () => {
    const cases = [
      { state: { name: BOOKING_STEP.IDLE }, expected: 0 },
      { state: { name: BOOKING_STEP.SELECTING_SPECIALTY, items: [] }, expected: 1 },
      { state: { name: BOOKING_STEP.SELECTING_DOCTOR, specialtyId: '1', specialtyName: 'Card', items: [] }, expected: 2 },
      { state: { name: BOOKING_STEP.SELECTING_TIME, specialtyId: '1', doctorId: '1', doctorName: 'Dr', items: [] }, expected: 3 },
      { state: { name: BOOKING_STEP.CONFIRMING, specialtyId: '1', doctorId: '1', doctorName: 'Dr', timeSlot: '9:00', draft: DRAFT }, expected: 4 },
      { state: { name: BOOKING_STEP.COMPLETED, bookingId: 'b1' }, expected: 5 },
    ];

    for (const c of cases) {
      expect(flowStepFromState(c.state as BookingState)).toBe(c.expected);
    }
  });
});

describe('applyTransition — successful flows', () => {
  test('idle → selecting_specialty', () => {
    const [err, outcome] = testTransition({ name: BOOKING_STEP.IDLE }, { type: 'select', value: '1' }, MOCK_SPECIALTIES);

    expect(err).toBeNull();
    expect(outcome?.nextState.name).toBe(BOOKING_STEP.SELECTING_SPECIALTY);
    expect(outcome?.advance).toBe(true);
  });

  test('selecting_specialty → selecting_doctor', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_SPECIALTY,
      items: MOCK_SPECIALTIES,
    };
    const [err, outcome] = testTransition(state, { type: 'select', value: '1' }, MOCK_DOCTORS);

    expect(err).toBeNull();
    expect(outcome?.nextState.name).toBe(BOOKING_STEP.SELECTING_DOCTOR);
    if (outcome?.nextState.name === BOOKING_STEP.SELECTING_DOCTOR) {
      expect(outcome.nextState.specialtyId).toBe('s1');
    }
  });

  test('selecting_doctor → selecting_time', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_DOCTOR,
      specialtyId: 's1',
      specialtyName: 'Cardiología',
      items: MOCK_DOCTORS,
    };
    const [err, outcome] = testTransition(state, { type: 'select', value: '1' }, MOCK_SLOTS);

    expect(err).toBeNull();
    expect(outcome?.nextState.name).toBe(BOOKING_STEP.SELECTING_TIME);
  });

  test('selecting_time → confirming (and draft accumulation)', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_TIME,
      specialtyId: 's1',
      doctorId: 'd1',
      doctorName: 'Dr. Pérez',
      items: MOCK_SLOTS,
    };
    const [err, outcome] = testTransition(state, { type: 'select', value: '1' });

    expect(err).toBeNull();
    expect(outcome?.nextState.name).toBe(BOOKING_STEP.CONFIRMING);

    if (outcome?.nextState.name === BOOKING_STEP.CONFIRMING) {
      expect(outcome.nextState.timeSlot).toBe('9:00 AM');
      expect(outcome.nextState.draft.specialty_id).toBe('s1');
      expect(outcome.nextState.draft.doctor_id).toBe('d1');
      expect(outcome.nextState.draft.start_time).toBe('2026-04-13T09:00:00Z');
    }
  });

  test('confirming → completed', () => {
    const state: BookingState = {
      name: BOOKING_STEP.CONFIRMING,
      specialtyId: 's1',
      doctorId: 'd1',
      doctorName: 'Dr. Pérez',
      timeSlot: '9:00 AM',
      draft: DRAFT,
    };
    const [err, outcome] = testTransition(state, { type: 'confirm_yes' });

    expect(err).toBeNull();
    expect(outcome?.nextState.name).toBe(BOOKING_STEP.COMPLETED);
    expect(outcome?.responseText).toContain('Confirmada');
  });

  test('completed → idle', () => {
    const state: BookingState = { name: BOOKING_STEP.COMPLETED, bookingId: 'b1' };
    const [err, outcome] = testTransition(state, { type: 'select', value: '1' });

    expect(err).toBeNull();
    expect(outcome?.nextState.name).toBe(BOOKING_STEP.IDLE);
  });
});

describe('applyTransition — navigation & cancellation', () => {
  test('selecting_specialty → back → idle', () => {
    const state: BookingState = { name: BOOKING_STEP.SELECTING_SPECIALTY, items: MOCK_SPECIALTIES };
    const [err, outcome] = testTransition(state, { type: 'back' });

    expect(err).toBeNull();
    expect(outcome?.nextState.name).toBe(BOOKING_STEP.IDLE);
  });

  test('confirming → confirm_no → selecting_time', () => {
    const state: BookingState = {
      name: BOOKING_STEP.CONFIRMING,
      specialtyId: 's1',
      doctorId: 'd1',
      doctorName: 'Dr. Pérez',
      timeSlot: '9:00 AM',
      draft: DRAFT,
    };
    const [err, outcome] = testTransition(state, { type: 'confirm_no' }, MOCK_SLOTS);

    expect(err).toBeNull();
    expect(outcome?.nextState.name).toBe(BOOKING_STEP.SELECTING_TIME);
  });
});

describe('applyTransition — error handling', () => {
  test('selecting_specialty → invalid selection → error', () => {
    const state: BookingState = { name: BOOKING_STEP.SELECTING_SPECIALTY, items: MOCK_SPECIALTIES };
    const [err, outcome] = testTransition(state, { type: 'select', value: '99' });

    expect(err).toBeInstanceOf(Error);
    expect(outcome?.responseText).toContain('Opción inválida');
  });

  test('idle with no items → error', () => {
    const [err, outcome] = testTransition({ name: BOOKING_STEP.IDLE }, { type: 'select', value: '1' }, []);

    expect(err).toBeInstanceOf(Error);
    expect(outcome?.responseText).toContain('No hay especialidades');
  });

  test('selecting_time with invalid slot → error', () => {
    const state: BookingState = {
      name: BOOKING_STEP.SELECTING_TIME,
      specialtyId: 's1',
      doctorId: 'd1',
      doctorName: 'Dr. Pérez',
      items: MOCK_SLOTS,
    };
    const [err, outcome] = testTransition(state, { type: 'select', value: '99' });

    expect(err).toBeInstanceOf(Error);
    expect(outcome?.responseText).toContain('Opción inválida');
  });
});
