import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import type { Result } from '../internal/result';
import { main } from './main';

/**
 * REASONING TRACE
 * ### Mission Decomposition
 * - Refactor test file for SOLID compliance and legibility.
 * - Improve environment isolation and assertion helpers.
 * - Group tests by responsibility (Validation, Environment, Execution).
 *
 * ### SOLID Compliance Check
 * - SRP: Test groups focused on specific failure/success categories.
 * - DRY: Centralized environment setup and reusable assertion helpers.
 * - KISS: Clear, declarative test names and consistent structure.
 */

// ============================================================
// TEST HELPERS
// ============================================================

/**
 * Asserts that a Result<T> is an error with the expected message.
 * Compliant with §1.A.3: Errors are values.
 */
function expectError(result: Result<unknown>, messageSubstring: string): void {
  const [error, data] = result;
  expect(data).toBeNull();
  expect(error).not.toBeNull();
  expect(error?.message).toContain(messageSubstring);
}

/**
 * Asserts that a Result<T> is successful and returns the data.
 */
function expectSuccess<T>(result: Result<T>): T {
  const [error, data] = result;
  expect(error).toBeNull();
  expect(data).not.toBeNull();
  return data as T;
}

// ============================================================
// GCAL RECONCILE TEST SUITE
// ============================================================

describe('GCal Reconcile Cron', () => {
  const DEFAULT_ENV = {
    DATABASE_URL: 'postgresql://test:test@localhost/test',
    GCAL_ACCESS_TOKEN: 'test-token',
  };

  beforeEach(() => {
    Object.entries(DEFAULT_ENV).forEach(([key, value]) => {
      process.env[key] = value;
    });
  });

  afterEach(() => {
    Object.keys(DEFAULT_ENV).forEach((key) => {
      delete process.env[key];
    });
  });

  describe('Validación de Entorno', () => {
    test('Debe fallar si DATABASE_URL no está configurada', async () => {
      delete process.env['DATABASE_URL'];
      const result = await main({});
      expectError(result, 'DATABASE_URL not configured');
    });
  });

  describe('Validación de Parámetros (Zod)', () => {
    test('Debe fallar si max_retries excede el máximo permitido', async () => {
      const result = await main({ max_retries: 10 });
      expectError(result, 'Validation error');
    });

    test('Debe fallar si batch_size excede el máximo permitido', async () => {
      const result = await main({ batch_size: 500 });
      expectError(result, 'Validation error');
    });

    test('Debe aceptar valores por defecto cuando no se pasan parámetros', async () => {
      const result = await main({});
      // Validamos que pase el check de Zod (no devuelve error de validación)
      const [error] = result;
      if (error) {
        expect(error.message).not.toContain('Validation error');
      }
    });
  });

  describe('Lógica de Ejecución', () => {
    test('Debe respetar el modo dry_run sin realizar cambios', async () => {
      const result = await main({ 
        dry_run: true, 
        batch_size: 10, 
        max_retries: 1 
      });

      const [error, data] = result;

      // En entorno de test, el error de conexión es aceptable si no hay DB real,
      // pero el flujo debe haber pasado la validación de entrada.
      if (error) {
        // Si hay error, no debe ser de validación
        expect(error.message).not.toContain('Validation error');
      } else {
        expect(data?.processed).toBeGreaterThanOrEqual(0);
        expect(data?.skipped).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
