/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Refactor fetch-retry for SOLID compliance
 * DB Tables Used  : None
 * Concurrency Risk: No
 * GCal Calls      : No (this is a wrapper utility)
 * Idempotency Key : No
 * RLS Tenant ID   : No
 * Zod Schemas     : No
 */

/**
 * REASONING TRACE
 * ### Mission Decomposition
 * - Refactor fetchWithRetry to improve SOLID compliance and readability.
 * - Extract backoff calculation and response classification into helper functions (SRP).
 * - Ensure strict adherence to AGENTS.md §1 & §2 (Result types, no throw, explicit types).
 *
 * ### Schema Verification
 * - N/A
 *
 * ### Failure Mode Analysis
 * - Non-retryable HTTP errors (4xx except 429) terminate the loop immediately.
 * - Retryable errors (429, 5xx) and network exceptions trigger exponential backoff.
 * - Final error is returned if all retries are exhausted.
 *
 * ### SOLID Compliance Check
 * - SRP: Helper functions handle specific logic (delay, classification).
 * - DRY: Common backoff constants and error formatting centralized.
 * - KISS: Main loop is simplified and highly readable.
 *
 * → CLEARED FOR CODE GENERATION
 */

import { RETRY_BACKOFF_BASE_MS, RETRY_BACKOFF_MULTIPLIER } from '../config';
import type { Result } from '../result';

export interface FetchWithRetryOptions extends RequestInit {
  readonly maxRetries?: number;
  readonly operationName?: string;
}

/**
 * Calculates exponential backoff delay in milliseconds.
 * Formula: base * multiplier^attempt
 * SRP: Isolated delay calculation.
 */
function getBackoffDelayMs(attempt: number): number {
  return RETRY_BACKOFF_BASE_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt);
}

/**
 * Classifies an HTTP response into retryable or permanent failure.
 * Returns the corresponding error and retry flag.
 * SRP: Isolated response analysis logic.
 */
async function analyzeResponse(
  response: Response
): Promise<{ readonly isRetryable: boolean; readonly error: Error }> {
  // If we are here, response.ok is false
  const body = await response.text().catch(() => 'no_response_body');
  const error = new Error(`HTTP_${response.status}: ${body}`);
  
  // 429 (Too Many Requests) and 5xx (Server Errors) are considered transient/retryable
  const isRetryable = response.status === 429 || (response.status >= 500 && response.status < 600);
  
  return { isRetryable, error };
}

/**
 * Enhanced fetch wrapper with automatic retries and exponential backoff.
 * All external HTTP calls must flow through this to ensure reliability.
 * Compliant with AGENTS.md §5.3.
 */
export async function fetchWithRetry(
  url: string | URL,
  options?: FetchWithRetryOptions
): Promise<Result<Response>> {
  const { maxRetries = 3, operationName = 'fetch', ...fetchOptions } = options ?? {};
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);
      
      if (response.ok) {
        return [null, response];
      }

      const { isRetryable, error } = await analyzeResponse(response);
      lastError = error;

      if (!isRetryable) {
        break;
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Network exceptions (timeouts, DNS failures) are generally retryable
    }

    // Delay before next attempt if we haven't exhausted retries
    if (attempt < maxRetries - 1) {
      const delay = getBackoffDelayMs(attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  const finalError = lastError ?? new Error(`${operationName}: Failed after ${maxRetries} attempts`);
  return [finalError, null];
}
