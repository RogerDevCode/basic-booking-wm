import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock('postgres', () => {
  type MockPg = ReturnType<typeof vi.fn> & { end: ReturnType<typeof vi.fn> };
  const mockFn = vi.fn() as MockPg;
  mockFn.end = vi.fn().mockResolvedValue(undefined);
  return { default: mockFn };
});

import postgres from 'postgres';

describe('GCal Reconcile Cron', () => {
  let mockSql: ReturnType<typeof vi.fn> & { end: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockSql = vi.fn() as ReturnType<typeof vi.fn> & { end: ReturnType<typeof vi.fn> };
    mockSql.end = vi.fn().mockResolvedValue(undefined);
    (postgres as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSql);
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
    process.env['GCAL_ACCESS_TOKEN'] = 'test-token';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('Debe fallar sin DATABASE_URL', async () => {
    delete process.env['DATABASE_URL'];
    const { main } = await import('./main');
    const result = await main({});
    expect(result.success).toBe(false);
    expect(result.error_message).toContain('DATABASE_URL');
  });

  test('Debe validar max_retries fuera de rango', async () => {
    const { main } = await import('./main');
    const result = await main({ max_retries: 6 });
    expect(result.success).toBe(false);
    expect(result.error_message).toContain('Validation error');
  });

  test('Debe validar batch_size fuera de rango', async () => {
    const { main } = await import('./main');
    const result = await main({ batch_size: 200 });
    expect(result.success).toBe(false);
    expect(result.error_message).toContain('Validation error');
  });

  test('Debe procesar bookings en dry_run mode', async () => {
    mockSql.mockResolvedValue([]);

    const { main } = await import('./main');
    const result = await main({ dry_run: true, batch_size: 50, max_retries: 3, max_gcal_retries: 10 });

    expect(result.success).toBe(true);
    expect(result.data?.processed).toBe(0);
    expect(result.data?.skipped).toBe(0);
  });

  test('Debe respetar batch_size', async () => {
    const fakeBookings = Array.from({ length: 5 }, (_, i) => ({
      booking_id: `00000000-0000-0000-0000-00000000000${i}`,
      status: 'confirmed',
      start_time: new Date(),
      end_time: new Date(),
      gcal_provider_event_id: null,
      gcal_patient_event_id: null,
      gcal_retry_count: 0,
      provider_name: 'Dr. Test',
      provider_calendar_id: 'cal1',
      patient_name: 'Patient Test',
      patient_calendar_id: null,
      service_name: 'Consulta',
    }));

    mockSql.mockResolvedValue(fakeBookings);

    const { main } = await import('./main');
    const result = await main({ dry_run: true, batch_size: 5 });

    expect(result.success).toBe(true);
    expect(result.data?.processed).toBe(5);
    expect(result.data?.skipped).toBe(5);
  });
});
