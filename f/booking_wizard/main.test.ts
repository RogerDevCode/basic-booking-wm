import { describe, test, expect, beforeEach } from 'vitest';
import type { Result } from '../internal/result';

function assertOk<T>(result: Result<T>): T {
  expect(result[0]).toBeNull();
  expect(result[1]).not.toBeNull();
  return result[1] as T;
}

function expectStep(actual: unknown, expected: number): void {
  const v = typeof actual === 'number' ? actual : typeof actual === 'string' ? Number(actual) : -1;
  expect(v).toBe(expected);
}

let testProviderId: string | null = null;
let testServiceId: string | null = null;
let testClientId: string | null = null;

async function ensureTestSeeds(): Promise<{ provider_id: string; service_id: string; client_id: string }> {
  if (testProviderId && testServiceId && testClientId) {
    return { provider_id: testProviderId, service_id: testServiceId, client_id: testClientId };
  }
  const { createDbClient } = await import('../internal/db/client');
  const sql = createDbClient({ url: process.env['DATABASE_URL']! });
  try {
    const [pRow] = await sql<{ provider_id: string }[]>`SELECT provider_id FROM providers LIMIT 1`;
    const [sRow] = await sql<{ service_id: string }[]>`SELECT service_id FROM services LIMIT 1`;
    const [cRow] = await sql<{ client_id: string }[]>`SELECT client_id FROM clients LIMIT 1`;
    testProviderId = pRow?.provider_id ?? null;
    testServiceId = sRow?.service_id ?? null;
    testClientId = cRow?.client_id ?? null;
    if (!testProviderId || !testServiceId || !testClientId) throw new Error('Test seeds not found');
  } finally { /* don't end shared pool */ }
  return { provider_id: testProviderId, service_id: testServiceId, client_id: testClientId };
}

describe('Booking Wizard', () => {
  beforeEach(() => { /* DATABASE_URL from testcontainers */ });

  test('start should return date selection prompt', async () => {
    const { main } = await import('./main');
    const result = await main({
      action: 'start',
      wizard_state: { chat_id: '123', client_id: 'p1', step: '0', selected_date: '', selected_time: '' },
    });
    const data = assertOk<Record<string, unknown>>(result);
    const ws = data['wizard_state'] as Record<string, unknown>;
    expectStep(ws['step'], 1);
    expect(String(data['message'])).toContain('Elige una fecha');
  });

  test('cancel should reset state to step 0', async () => {
    const { main } = await import('./main');
    const result = await main({
      action: 'cancel',
      wizard_state: { step: '2', client_id: 'p1', chat_id: '123', selected_date: '2026-04-15', selected_time: '10:00' },
    });
    const data = assertOk<Record<string, unknown>>(result);
    const ws = data['wizard_state'] as Record<string, unknown>;
    expectStep(ws['step'], 0);
    expect(String(data['message'])).toContain('Cancelado');
  });

  test('back from step 1 should show main menu', async () => {
    const { main } = await import('./main');
    const result = await main({
      action: 'back',
      wizard_state: { step: '1', client_id: 'p1', chat_id: '123', selected_date: '', selected_time: '' },
    });
    const data = assertOk<Record<string, unknown>>(result);
    const ws = data['wizard_state'] as Record<string, unknown>;
    expectStep(ws['step'], 0);
    expect(String(data['message'])).toContain('Menú principal');
  });

  test('confirm without date/time should reset to date selection', async () => {
    const { main } = await import('./main');
    const result = await main({
      action: 'confirm',
      wizard_state: { step: '3', client_id: 'p1', chat_id: '123', selected_date: '', selected_time: '' },
    });
    const data = assertOk<Record<string, unknown>>(result);
    const ws = data['wizard_state'] as Record<string, unknown>;
    expectStep(ws['step'], 1);
    expect(String(data['message'])).toContain('Elige una fecha');
  });

  test('select_date with day name should advance to time selection', async () => {
    const { main } = await import('./main');
    const today = new Date();
    const dayName = today.toLocaleDateString('es-AR', { weekday: 'short' });
    const result = await main({
      action: 'select_date',
      wizard_state: { step: '1', client_id: 'p1', chat_id: '123', selected_date: '', selected_time: '' },
      user_input: dayName,
    });
    const data = assertOk<Record<string, unknown>>(result);
    const ws = data['wizard_state'] as Record<string, unknown>;
    expectStep(ws['step'], 2);
    expect(String(data['message'])).toContain('horario');
  });

  test('select_time with valid input should advance to confirmation', async () => {
    const { main } = await import('./main');
    const seeds = await ensureTestSeeds();
    const result = await main({
      action: 'select_time',
      wizard_state: { step: '2', client_id: seeds.client_id, chat_id: '123', selected_date: '2026-04-15', selected_time: '' },
      user_input: '10:00',
      provider_id: seeds.provider_id,
      service_id: seeds.service_id,
    });
    const data = assertOk<Record<string, unknown>>(result);
    console.log('select_time result data:', data);
    const ws = data['wizard_state'] as Record<string, unknown>;
    expectStep(ws['step'], 3);
    expect(String(data['message'])).toContain('Confirma');
  });

  test('confirm without provider_id should show error or reset', async () => {
    const { main } = await import('./main');
    const result = await main({
      action: 'confirm',
      wizard_state: { step: '3', client_id: 'p1', chat_id: '123', selected_date: '2026-04-15', selected_time: '10:00' },
    });
    if (result[0] !== null) {
      expect(result[0]?.message).toBeDefined();
    } else {
      expect(String((result[1] as Record<string, unknown>)['message'] ?? '').length).toBeGreaterThan(0);
    }
  });

  test('full flow: start → select_date → select_time → confirm', async () => {
    const { main } = await import('./main');
    const seeds = await ensureTestSeeds();
    let state: Record<string, string> = { chat_id: '123', client_id: seeds.client_id, step: '0', selected_date: '', selected_time: '' };

    const startResult = await main({ action: 'start', wizard_state: state });
    const startData = assertOk<Record<string, unknown>>(startResult);
    expectStep((startData['wizard_state'] as Record<string, unknown>)['step'], 1);
    state = startData['wizard_state'] as Record<string, string>;

    const today = new Date();
    const dayName = today.toLocaleDateString('es-AR', { weekday: 'short' });
    const dateResult = await main({ action: 'select_date', wizard_state: state, user_input: dayName });
    const dateData = assertOk<Record<string, unknown>>(dateResult);
    expectStep((dateData['wizard_state'] as Record<string, unknown>)['step'], 2);
    state = dateData['wizard_state'] as Record<string, string>;

    const timeResult = await main({
      action: 'select_time', wizard_state: state, user_input: '10:00',
      provider_id: seeds.provider_id, service_id: seeds.service_id,
    });
    const timeData = assertOk<Record<string, unknown>>(timeResult);
    expectStep((timeData['wizard_state'] as Record<string, unknown>)['step'], 3);
    state = timeData['wizard_state'] as Record<string, string>;

    const confirmResult = await main({
      action: 'confirm', wizard_state: state,
      provider_id: seeds.provider_id, service_id: seeds.service_id,
    });
    const confirmData = assertOk<Record<string, unknown>>(confirmResult);
    expect(String(confirmData['message'])).toContain('Cita Agendada');
  });
});
