import { describe, test, expect } from 'vitest';
import type { Result } from '../internal/result/index.ts';

/**
 * Helper: assert that a [Error | null, T | null] result is an error
 * with a message containing the expected substring.
 */
function assertError(result: Result<unknown>, substring: string): void {
  expect(result[0]).not.toBeNull();
  expect(result[0]?.message.toLowerCase()).toContain(substring.toLowerCase());
  expect(result[1]).toBeNull();
}

describe('Booking Cancel - Input Validation', () => {
  test('should reject invalid booking_id', async () => {
    const { main } = await import('./main');
    const result = await main({
      booking_id: 'not-a-uuid',
      actor: 'client',
    });

    // Zod rejects invalid UUID format
    expect(result[0]).not.toBeNull();
  });

  test('should reject invalid actor', async () => {
    const { main } = await import('./main');
    const result = await main({
      booking_id: '550e8400-e29b-41d4-a716-446655440000',
      actor: 'invalid',
    });

    // Zod rejects invalid enum value
    expect(result[0]).not.toBeNull();
  });
});
