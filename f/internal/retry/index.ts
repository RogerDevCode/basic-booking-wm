// ============================================================================
// RETRY — Universal retry utility with exponential backoff
// ============================================================================
// All retry logic in the codebase MUST use this module.
// No duplicated retry code anywhere else.
// ============================================================================

import { MAX_RETRIES, RETRY_BACKOFF_BASE_MS, RETRY_BACKOFF_MULTIPLIER } from '../config';

export interface RetryOptions {
  maxAttempts?: number;
  baseBackoffMs?: number;
  multiplier?: number;
  operationName: string;
}

export type RetryResult<T> =
  | { success: true; data: T; attempts: number }
  | { success: false; error: Error; attempts: number; isPermanent: boolean };

export function isPermanentError(error: Error): boolean {
  const msg = error.message;
  // GCal API permanent errors
  if (msg.includes('400') || msg.includes('Bad Request')) return true;
  if (msg.includes('401') || msg.includes('Unauthorized')) return true;
  if (msg.includes('403') || msg.includes('Forbidden')) return true;
  if (msg.includes('404') || msg.includes('Not Found')) return true;
  if (msg.includes('409') || msg.includes('Conflict')) return true;
  // Validation errors
  if (msg.startsWith('CONFIGURATION_ERROR:')) return true;
  if (msg.startsWith('Validation error:')) return true;
  return false;
}

export function calculateBackoff(attempt: number, options?: Pick<RetryOptions, 'baseBackoffMs' | 'multiplier'>): number {
  const base = options?.baseBackoffMs ?? RETRY_BACKOFF_BASE_MS;
  const mult = options?.multiplier ?? RETRY_BACKOFF_MULTIPLIER;
  return Math.pow(mult, attempt) * base;
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<RetryResult<T>> {
  const maxAttempts = options.maxAttempts ?? MAX_RETRIES;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await operation();
      return { success: true, data: result, attempts: attempt + 1 };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      lastError = error;

      if (isPermanentError(error)) {
        return {
          success: false,
          error: new Error(`${options.operationName}: permanent error on attempt ${String(attempt + 1)}: ${error.message}`),
          attempts: attempt + 1,
          isPermanent: true,
        };
      }

      if (attempt < maxAttempts - 1) {
        const backoffMs = calculateBackoff(attempt, options);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  return {
    success: false,
    error: new Error(`${options.operationName}: failed after ${String(maxAttempts)} attempts. Last error: ${lastError?.message ?? 'unknown'}`),
    attempts: maxAttempts,
    isPermanent: false,
  };
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
