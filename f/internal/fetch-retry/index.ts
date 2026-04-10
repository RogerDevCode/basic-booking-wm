// ============================================================================
// FETCH WITH RETRY — AGENTS.md §5.3 compliant wrapper
// ============================================================================
// Wraps fetch() with exponential backoff: 500ms × 2^attempt
// All external HTTP calls MUST use this instead of raw fetch().
// Returns [Error | null, Response | null] — no throw.
// ============================================================================

import { RETRY_BACKOFF_BASE_MS, RETRY_BACKOFF_MULTIPLIER } from '../config';
import type { Result } from '../result';

export interface FetchWithRetryOptions extends RequestInit {
  readonly maxRetries?: number;
  readonly operationName?: string;
}

export async function fetchWithRetry(
  url: string | URL,
  options?: FetchWithRetryOptions
): Promise<Result<Response>> {
  const maxRetries = options?.maxRetries ?? 3;
  const { maxRetries: _, operationName, ...fetchOptions } = options ?? {};
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);
      if (response.ok) return [null, response];

      // Check for permanent errors (4xx except 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const text = await response.text().catch(() => '');
        return [new Error(`HTTP ${String(response.status)}: ${text}`), null];
      }

      // Retry-able error (5xx, 429)
      const text = await response.text().catch(() => '');
      lastError = new Error(`HTTP ${String(response.status)}: ${text}`);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }

    if (attempt < maxRetries - 1) {
      const backoffMs = RETRY_BACKOFF_BASE_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }

  return [lastError ?? new Error(`${operationName ?? 'fetch'}: unknown error after ${String(maxRetries)} retries`), null];
}
