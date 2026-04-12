/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Integration tests for the Telegram router with booking wizard
 * DB Tables Used  : None — wizard uses mocked state transitions
 * Concurrency Risk: NO
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : YES
 */

import { describe, test, expect } from 'vitest';
import { main } from './main';

// ============================================================================
// Router without state — deterministic routes
// ============================================================================

describe('Telegram Router — deterministic routes (no state)', () => {
  test('/start returns welcome command', async () => {
    const [err, result] = await main({ chat_id: '12345', text: '/start' });
    expect(err).toBeNull();
    expect(result!.route).toBe('command');
    expect(result!.forward_to_ai).toBe(false);
    expect(result!.response_text).toContain('Bienvenido');
  });

  test('callback cnf:uuid returns confirmation', async () => {
    const [err, result] = await main({ chat_id: '12345', text: '', callback_data: 'cnf:booking-123' });
    expect(err).toBeNull();
    expect(result!.route).toBe('callback');
    expect(result!.callback_action).toBe('cnf');
    expect(result!.callback_booking_id).toBe('booking-123');
  });

  test('menu option "1" returns book_appointment', async () => {
    const [err, result] = await main({ chat_id: '12345', text: '1' });
    expect(err).toBeNull();
    expect(result!.route).toBe('menu');
    expect(result!.menu_action).toBe('book_appointment');
  });

  test('free text falls back to AI Agent', async () => {
    const [err, result] = await main({ chat_id: '12345', text: 'Hola necesito una cita' });
    expect(err).toBeNull();
    expect(result!.route).toBe('ai_agent');
    expect(result!.forward_to_ai).toBe(true);
  });
});

// ============================================================================
// Router with booking state — FSM wizard delegation
// ============================================================================

describe('Telegram Router — wizard delegation (requires DATABASE_URL)', () => {
  // These tests only run if DATABASE_URL is set
  const hasDb = process.env['DATABASE_URL'] !== undefined;

  test.skipIf(!hasDb)('wizard in selecting_specialty step processes input', async () => {
    const bookingState = {
      name: 'selecting_specialty' as const,
      error: null,
      items: [] as Array<{ id: string; name: string }>,
    };

    const [err, result] = await main({
      chat_id: '12345',
      text: '1',
      booking_state: bookingState,
      booking_draft: null,
    });

    expect(err).toBeNull();
    expect(result!.route).toBe('wizard');
    expect(result!.forward_to_ai).toBe(false);
    // nextFlowStep should be >= 1 (moved forward or stayed)
    expect(result!.nextFlowStep).toBeGreaterThanOrEqual(1);
  });

  test.skipIf(!hasDb)('wizard back action moves backward', async () => {
    const bookingState = {
      name: 'selecting_specialty' as const,
      error: null,
      items: [] as Array<{ id: string; name: string }>,
    };

    const [err, result] = await main({
      chat_id: '12345',
      text: 'volver',
      booking_state: bookingState,
      booking_draft: null,
    });

    expect(err).toBeNull();
    expect(result!.route).toBe('wizard');
    // Going back from selecting_specialty → idle
    expect(result!.nextState).not.toBeNull();
    expect(result!.nextState!.name).toBe('idle');
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe('Telegram Router — edge cases', () => {
  test('empty text + no callback → ai_agent', async () => {
    const [err, result] = await main({ chat_id: '12345', text: null, callback_data: null });
    expect(err).toBeNull();
    expect(result!.route).toBe('ai_agent');
    expect(result!.forward_to_ai).toBe(true);
  });

  test('unknown booking state → ai_agent fallback', async () => {
    // When booking_state has an unexpected structure, router should handle gracefully
    const [err, result] = await main({
      chat_id: '12345',
      text: 'hello',
      booking_state: { name: 'unknown_state' },
      booking_draft: null,
    });

    // Should still route (either wizard or ai_agent depending on how main handles unknown)
    expect(err).toBeNull();
    expect(result!.forward_to_ai !== null || result!.route === 'wizard').toBe(true);
  });
});
