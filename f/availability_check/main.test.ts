import { describe, test, expect } from 'vitest';
import type { Result } from '../internal/result/index';

/**
 * Helper: assert that a [Error | null, T | null] result is an error
 * with a message containing the expected substring.
 */
function assertError(result: Result<unknown>, substring: string): void {
  expect(result[0]).not.toBeNull();
  expect(result[0]?.message.toLowerCase()).toContain(substring.toLowerCase());
  expect(result[1]).toBeNull();
}

describe('Availability Check - Input Validation', () => {
  test('should reject invalid provider_id', async () => {
    const { main } = await import('./main');
    const result = await main({
      provider_id: 'not-a-uuid',
      date: '2026-04-15',
    });

    expect(result[0]).not.toBeNull();
  });

  test('should reject invalid date format', async () => {
    const { main } = await import('./main');
    const result = await main({
      provider_id: '550e8400-e29b-41d4-a716-446655440000',
      date: 'not-a-date',
    });

    assertError(result, 'YYYY-MM-DD');
  });
});
