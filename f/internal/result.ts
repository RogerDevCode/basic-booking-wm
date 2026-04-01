// ============================================================================
// MINIMAL RESULT TYPE — For Windmill scripts
// Replaces deleted internal/types/domain.ts
// ============================================================================

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(error: Error): Result<T> {
  return { ok: false, error };
}
