import { describe, test, expect } from 'vitest';
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

// ============================================================================
// Booking Create — Input Validation
// ============================================================================

describe('Booking Create - Input Validation', () => {
  test('should reject missing client_id', async () => {
    const { main } = await import('./main');
    const result = await main({
      provider_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      service_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
      start_time: '2026-04-15T10:00:00Z',
      idempotency_key: 'test-key-001',
    });

    assertError(result, 'client_id');
  });

  test('should reject invalid UUID format', async () => {
    const { main } = await import('./main');
    const result = await main({
      client_id: 'not-a-uuid',
      provider_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      service_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
      start_time: '2026-04-15T10:00:00Z',
      idempotency_key: 'test-key-002',
    });

    // Zod rejects invalid UUID format
    expect(result[0]).not.toBeNull();
  });

  test('should reject invalid datetime', async () => {
    const { main } = await import('./main');
    const result = await main({
      client_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      provider_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      service_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
      start_time: 'not-a-date',
      idempotency_key: 'test-key-003',
    });

    assertError(result, 'start_time');
  });

  test('should reject missing idempotency_key', async () => {
    const { main } = await import('./main');
    const result = await main({
      client_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      provider_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      service_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
      start_time: '2026-04-15T10:00:00Z',
    });

    assertError(result, 'idempotency_key');
  });
});

// ============================================================================
// Booking Cancel — Input Validation
// ============================================================================

describe('Booking Cancel - Input Validation', () => {
  test('should reject invalid booking_id', async () => {
    const { main } = await import('../booking_cancel/main');
    const result = await main({
      booking_id: 'not-a-uuid',
      actor: 'client',
    });

    // Zod rejects invalid UUID format
    expect(result[0]).not.toBeNull();
  });

  test('should reject invalid actor', async () => {
    const { main } = await import('../booking_cancel/main');
    const result = await main({
      booking_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      actor: 'invalid',
    });

    // Zod rejects invalid enum value
    expect(result[0]).not.toBeNull();
  });
});

// ============================================================================
// Booking Reschedule — Input Validation
// ============================================================================

describe('Booking Reschedule - Input Validation', () => {
  test('should reject invalid booking_id', async () => {
    const { main } = await import('../booking_reschedule/main');
    const result = await main({
      booking_id: 'not-a-uuid',
      new_start_time: '2026-04-16T14:00:00Z',
      actor: 'client',
    });

    expect(result[0]).not.toBeNull();
  });

  test('should reject invalid new_start_time', async () => {
    const { main } = await import('../booking_reschedule/main');
    const result = await main({
      booking_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      new_start_time: 'not-a-date',
      actor: 'client',
    });

    assertError(result, 'new_start_time');
  });
});

// ============================================================================
// Availability Check — Input Validation
// ============================================================================

describe('Availability Check - Input Validation', () => {
  test('should reject invalid provider_id', async () => {
    const { main } = await import('../availability_check/main');
    const result = await main({
      provider_id: 'not-a-uuid',
      date: '2026-04-15',
    });

    expect(result[0]).not.toBeNull();
  });

  test('should reject invalid date format', async () => {
    const { main } = await import('../availability_check/main');
    const result = await main({
      provider_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      date: 'not-a-date',
    });

    assertError(result, 'YYYY-MM-DD');
  });
});
