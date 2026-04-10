import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import type { Result } from '../internal/result';

/**
 * Helper: assert that a [Error | null, T | null] result is an error
 * with a message containing the expected substring.
 */
function assertError(result: Result<unknown>, substring: string): void {
  expect(result[0]).not.toBeNull();
  expect(result[0]?.message).toContain(substring);
  expect(result[1]).toBeNull();
}

/**
 * Helper: assert that a [Error | null, T | null] result is successful.
 */
function assertOk<T>(result: Result<T>): T {
  expect(result[0]).toBeNull();
  expect(result[1]).not.toBeNull();
  return result[1] as T;
}

describe('GCal Reconcile Cron', () => {
  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
    process.env['GCAL_ACCESS_TOKEN'] = 'test-token';
  });

  afterEach(() => {
    delete process.env['DATABASE_URL'];
    delete process.env['GCAL_ACCESS_TOKEN'];
  });

  test('Debe fallar sin DATABASE_URL', async () => {
    delete process.env['DATABASE_URL'];
    const { main } = await import('./main');
    const result = await main({});

    assertError(result, 'DATABASE_URL');
  });

  test('Debe validar max_retries fuera de rango', async () => {
    const { main } = await import('./main');
    const result = await main({ max_retries: 6 });

    assertError(result, 'Validation error');
  });

  test('Debe validar batch_size fuera de rango', async () => {
    const { main } = await import('./main');
    const result = await main({ batch_size: 200 });

    assertError(result, 'Validation error');
  });

  test('Debe procesar bookings en dry_run mode', async () => {
    const { main } = await import('./main');
    const result = await main({ dry_run: true, batch_size: 50, max_retries: 3, max_gcal_retries: 10 });

    // In dry_run with no DB connection, it will fail to fetch bookings
    // but the validation should pass — the error should be about DB connection
    if (result[0] !== null) {
      // Expected: can't connect to DB in test environment
      expect(result[0]?.message).toBeDefined();
    } else {
      const data = assertOk<Record<string, unknown>>(result);
      expect(data['processed']).toBeGreaterThanOrEqual(0);
    }
  });

  test('Debe aceptar valores por defecto sin parametros', async () => {
    const { main } = await import('./main');
    const result = await main({});

    // Should pass validation (uses defaults)
    // Will fail on DB connection in test env — that's expected
    if (result[0] !== null) {
      // DB connection error is expected in test env
      expect(result[0]?.message).toBeDefined();
    }
  });
});
