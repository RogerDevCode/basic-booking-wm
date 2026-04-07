// ============================================================================
// RESULT TYPE — Strict tuple format per AGENTS.md §4
// ============================================================================
// AGENTS.md §4 mandates: type Result<T> = [Error | null, T | null]
// NO tagged unions ({ ok: true; value: T }) — tuples only.
// ============================================================================

export type Result<T> = [Error | null, T | null];
