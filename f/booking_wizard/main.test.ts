import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const mockInsert = vi.fn().mockReturnValue([{ booking_id: 'test-booking-uuid-12345' }]);
const mockEnd = vi.fn();

const sql = vi.fn(async (strings: TemplateStringsArray, ..._values: unknown[]) => {
  const query = strings.join('?');
  if (query.includes('SELECT') && query.includes('services')) {
    return [{ name: 'Test Service', duration_minutes: 30 }];
  }
  if (query.includes('SELECT') && query.includes('providers')) {
    return [{ name: 'Dr. Test' }];
  }
  if (query.includes('INSERT')) {
    return mockInsert(..._values);
  }
  return [];
});
(sql as unknown as Record<string, unknown>)['end'] = mockEnd;
(sql as unknown as Record<string, unknown>)['begin'] = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
  return fn(sql);
});

vi.mock('postgres', () => ({
  default: vi.fn(() => sql),
}));

const { main } = await import('./main');

describe('Booking Wizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReset();
    mockInsert.mockReturnValue([{ booking_id: 'test-booking-uuid-12345' }]);
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';
  });

  afterEach(() => {
    delete process.env['DATABASE_URL'];
  });

  test('start should return date selection', async () => {
    const result = await main({
      action: 'start',
      wizard_state: { chat_id: '123', client_id: 'p1', step: 0, selected_date: null, selected_time: null },
    });
    expect(result.success).toBe(true);
    const data = result.data as { wizard_state: { step: number }; reply_keyboard: unknown; message: string };
    expect(data.wizard_state.step).toBe(1);
    expect(data.reply_keyboard).toBeDefined();
    expect(data.message).toContain('Elige una fecha');
  });

  test('cancel should reset state', async () => {
    const result = await main({
      action: 'cancel',
      wizard_state: { step: 2, client_id: 'p1', chat_id: '123', selected_date: '2026-04-15', selected_time: '10:00' },
    });
    expect(result.success).toBe(true);
    const data = result.data as { wizard_state: { step: number; selected_date: null; selected_time: null }; message: string };
    expect(data.wizard_state.step).toBe(0);
    expect(data.wizard_state.selected_date).toBeNull();
    expect(data.wizard_state.selected_time).toBeNull();
    expect(data.message).toContain('Cancelado');
  });

  test('back from step 1 should show main menu', async () => {
    const result = await main({
      action: 'back',
      wizard_state: { step: 1, client_id: 'p1', chat_id: '123', selected_date: null, selected_time: null },
    });
    expect(result.success).toBe(true);
    const data = result.data as { wizard_state: { step: number }; message: string };
    expect(data.wizard_state.step).toBe(0);
    expect(data.message).toContain('Menú principal');
  });

  test('confirm without date/time should reset to date selection', async () => {
    const result = await main({
      action: 'confirm',
      wizard_state: { step: 3, client_id: 'p1', chat_id: '123', selected_date: null, selected_time: null },
    });
    expect(result.success).toBe(true);
    const data = result.data as { wizard_state: { step: number }; message: string };
    expect(data.wizard_state.step).toBe(1);
    expect(data.message).toContain('Elige una fecha');
  });

  test('select_date with day name should advance to time selection', async () => {
    const today = new Date();
    const dayName = today.toLocaleDateString('es-AR', { weekday: 'short' });
    const result = await main({
      action: 'select_date',
      wizard_state: { step: 1, client_id: 'p1', chat_id: '123', selected_date: null, selected_time: null },
      user_input: dayName,
    });
    expect(result.success).toBe(true);
    const data = result.data as { wizard_state: { step: number }; message: string };
    expect(data.wizard_state.step).toBe(2);
    expect(data.message).toContain('horario');
  });

  test('select_time with valid input should advance to confirmation', async () => {
    const result = await main({
      action: 'select_time',
      wizard_state: { step: 2, client_id: 'p1', chat_id: '123', selected_date: '2026-04-15', selected_time: null },
      user_input: '10:00',
      provider_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      service_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    });
    expect(result.success).toBe(true);
    const data = result.data as { wizard_state: { step: number; selected_time: string }; message: string };
    expect(data.wizard_state.step).toBe(3);
    expect(data.wizard_state.selected_time).toBe('10:00');
    expect(data.message).toContain('Confirma');
  });

  test('complete flow with DB write should show success message', async () => {
    const result = await main({
      action: 'confirm',
      wizard_state: { step: 3, client_id: 'p1', chat_id: '123', selected_date: '2026-04-15', selected_time: '10:00' },
      provider_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      service_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    });
    expect(result.success).toBe(true);
    const data = result.data as { wizard_state: { step: number }; is_complete: boolean; message: string };
    expect(data.wizard_state.step).toBe(99);
    expect(data.is_complete).toBe(true);
    expect(data.message).toContain('Cita Agendada');
    expect(data.message).toContain('test-booking-uuid');
  });

  test('confirm without provider_id should show error', async () => {
    const result = await main({
      action: 'confirm',
      wizard_state: { step: 3, client_id: 'p1', chat_id: '123', selected_date: '2026-04-15', selected_time: '10:00' },
    });
    expect(result.success).toBe(true);
    const data = result.data as { wizard_state: { step: number }; message: string };
    expect(data.message).toMatch(/Error|proveedor|Elige una fecha/i);
  });

  test('confirm with DB failure (null result) should show error', async () => {
    mockInsert.mockReturnValue(null);

    const result = await main({
      action: 'confirm',
      wizard_state: { step: 3, client_id: 'p1', chat_id: '123', selected_date: '2026-04-15', selected_time: '10:00' },
      provider_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      service_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    });
    expect(result.success).toBe(true);
    const data = result.data as { wizard_state: { step: number }; message: string };
    expect(data.message).toMatch(/agendar|Error/i);
  });

  test('confirm with duplicate booking should show idempotency error', async () => {
    mockInsert.mockImplementation(() => {
      throw new Error('duplicate key value violates unique constraint');
    });

    const result = await main({
      action: 'confirm',
      wizard_state: { step: 3, client_id: 'p1', chat_id: '123', selected_date: '2026-04-15', selected_time: '10:00' },
      provider_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      service_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    });
    expect(result.success).toBe(true);
    const data = result.data as { wizard_state: { step: number }; message: string };
    expect(data.message).toMatch(/duplicate|cita|Error/i);
  });

  test('confirm with overlapping booking should show conflict error', async () => {
    mockInsert.mockImplementation(() => {
      throw new Error('conflicting key value violates exclusion constraint "booking_no_overlap"');
    });

    const result = await main({
      action: 'confirm',
      wizard_state: { step: 3, client_id: 'p1', chat_id: '123', selected_date: '2026-04-15', selected_time: '10:00' },
      provider_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      service_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    });
    expect(result.success).toBe(true);
    const data = result.data as { wizard_state: { step: number }; message: string };
    expect(data.message).toMatch(/reservado|Error|constraint/i);
  });

  test('full flow: start to select_date to select_time to confirm', async () => {
    let state: Record<string, unknown> = { chat_id: '123', client_id: 'p1', step: 0, selected_date: null, selected_time: null };

    const startResult = await main({ action: 'start', wizard_state: state });
    expect(startResult.success).toBe(true);
    const startData = startResult.data as { wizard_state: Record<string, unknown>; message: string };
    expect(startData.wizard_state['step']).toBe(1);
    state = startData.wizard_state;

    const today = new Date();
    const dayName = today.toLocaleDateString('es-AR', { weekday: 'short' });
    const dateResult = await main({ action: 'select_date', wizard_state: state, user_input: dayName });
    expect(dateResult.success).toBe(true);
    const dateData = dateResult.data as { wizard_state: Record<string, unknown>; message: string };
    expect(dateData.wizard_state['step']).toBe(2);
    state = dateData.wizard_state;

    const timeResult = await main({ action: 'select_time', wizard_state: state, user_input: '10:00', provider_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', service_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' });
    expect(timeResult.success).toBe(true);
    const timeData = timeResult.data as { wizard_state: Record<string, unknown>; message: string };
    expect(timeData.wizard_state['step']).toBe(3);
    state = timeData.wizard_state;

    const confirmResult = await main({
      action: 'confirm',
      wizard_state: state,
      provider_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      service_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    });
    expect(confirmResult.success).toBe(true);
    const confirmData = confirmResult.data as { wizard_state: { step: number }; is_complete: boolean; message: string };
    expect(confirmData.wizard_state.step).toBe(99);
    expect(confirmData.is_complete).toBe(true);
    expect(confirmData.message).toContain('Cita Agendada');
  });
});
