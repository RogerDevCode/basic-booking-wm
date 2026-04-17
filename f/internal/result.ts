/**
 * RESULT TYPE — Strict tuple format per AGENTS.md §4
 *
 * AGENTS.md §4 mandates: type Result<T> = [Error | null, T | null]
 * NO tagged unions ({ ok: true; value: T }) — tuples only.
 *
 * §12.1: ERRORS ARE VALUES. EXCEPTIONS ARE SABOTAGE.
 * This module provides SOLID utilities to manage this contract.
 */

export type Result<T> = [Error | null, T | null];

/**
 * Creates a successful result.
 * SRP: Responsibility is constructing the success tuple.
 */
export function ok<T>(data: T): Result<T> {
  return [null, data];
}

/**
 * Creates a failed result.
 * SRP: Responsibility is constructing the error tuple.
 * Converts string errors into Error objects automatically to ensure type safety.
 */
export function fail<T>(error: Error | string): Result<T> {
  const err = error instanceof Error ? error : new Error(error);
  return [err, null];
}

/**
 * Type guard to check if a result is successful.
 */
export function isOk<T>(result: Result<T>): result is [null, T] {
  return result[0] === null;
}

/**
 * Type guard to check if a result failed.
 */
export function isFail<T>(result: Result<T>): result is [Error, null] {
  return result[0] !== null;
}

/**
 * Wraps a promise to ensure it returns a Result tuple instead of throwing.
 * Essential for bridging external libraries (§1.A.3).
 */
export async function wrap<T>(promise: Promise<T>): Promise<Result<T>> {
  try {
    const data = await promise;
    return ok(data);
  } catch (error: unknown) {
    return fail(error instanceof Error ? error : String(error));
  }
}
