// ============================================================================
// RESULT — Go-style error handling as values
// ============================================================================
// No throw/catch for control flow. All errors are returned as values.
// Callers MUST check for error before using the result.
// Pattern: const [err, result] = await someOperation();
//          if (err !== null) { /* handle error */ }
// ============================================================================

export type Result<T, E = Error> = [E | null, T | null];

export function ok<T>(value: T): Result<T> {
  return [null, value];
}

export function err<E>(e: E): Result<never, E> {
  return [e, null];
}

export function isError<T, E>(result: Result<T, E>): result is [E, null] {
  return result[0] !== null;
}

export function isOk<T, E>(result: Result<T, E>): result is [null, T] {
  return result[0] === null;
}
