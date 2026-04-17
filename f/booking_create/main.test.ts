/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Refactor Booking Create Tests (SOLID)
 * DB Tables Used  : None (Unit Tests with Mocks)
 * Concurrency Risk: NO
 * GCal Calls      : NO
 * Idempotency Key : YES
 * RLS Tenant ID   : NO
 * Zod Schemas     : YES (InputSchema validation)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { Result } from '../internal/result';
import { main } from './main';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../internal/db/client', () => ({
  createDbClient: vi.fn(() => ({
    query: vi.fn(),
    values: vi.fn(),
    unsafe: vi.fn(),
    end: vi.fn(),
  })),
}));

vi.mock('../internal/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Helper: assert that a [Error | null, T | null] result is an error
 * with a message containing the expected substring.
 */
function assertError(result: Result<unknown>, substring: string): void {
  expect(result[0]).not.toBeNull();
  expect(result[0]?.message.toLowerCase()).toContain(substring.toLowerCase());
  expect(result[1]).toBeNull();
}

// Using valid v4 UUIDs to pass Zod validation
const VALID_INPUT = {
  client_id: '550e8400-e29b-41d4-a716-446655440000',
  provider_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  service_id: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
  start_time: '2026-04-15T10:00:00Z',
  idempotency_key: 'test-key-001',
  notes: 'Optional test notes',
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Booking Create - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['DATABASE_URL'] = 'postgres://user:pass@localhost:5432/db';
  });

  // ─── Input Validation Tests ───────────────────────────────────────────────
  describe('Input Validation', () => {
    test('should reject missing client_id', async () => {
      const { client_id, ...invalidInput } = VALID_INPUT;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await main(invalidInput as any);
      assertError(result, 'client_id');
    });

    test('should reject invalid UUID format', async () => {
      const invalidInput = { ...VALID_INPUT, client_id: 'not-a-uuid' };
      const result = await main(invalidInput);
      // Zod rejects invalid UUID format
      expect(result[0]).not.toBeNull();
    });

    test('should reject invalid datetime', async () => {
      const invalidInput = { ...VALID_INPUT, start_time: 'not-a-date' };
      const result = await main(invalidInput);
      assertError(result, 'validation error');
    });

    test('should reject missing idempotency_key', async () => {
      const { idempotency_key, ...invalidInput } = VALID_INPUT;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await main(invalidInput as any);
      assertError(result, 'idempotency_key');
    });
  });

  // ─── Infrastructure Tests ─────────────────────────────────────────────────
  describe('Infrastructure', () => {
    test('should reject if DATABASE_URL is missing', async () => {
      delete process.env['DATABASE_URL'];
      const result = await main(VALID_INPUT);
      assertError(result, 'DATABASE_URL is required');
    });
  });

  // ─── Logic Flow (SRP + Mocked DB) ─────────────────────────────────────────
  // Note: Deep logic tests usually go to integration tests (tests/db-integration.test.ts)
  // because mocking the tagged template literals (tx.values`...`) is highly coupled
  // to the implementation details and violates KISS for unit tests.
  // However, we maintain SRP by keeping this file focused on booking_create.
});
