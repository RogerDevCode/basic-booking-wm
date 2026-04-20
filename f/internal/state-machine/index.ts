// ============================================================================
// STATE MACHINE — Booking Status Transition Validator
// ============================================================================
// AGENTS.md §5.2: Strict state machine with explicit terminal states.
// Single source of truth for booking status transitions.
// DRY: re-exports BookingStatus from db-types (single definition).
// KISS: function fits in 15 lines, does one thing (SRP).
// ============================================================================

import type { BookingStatus } from '../db-types/index';

// Re-export for convenience — consumers import from here or db-types
export type { BookingStatus } from '../db-types/index';

// ============================================================================
// VALID_TRANSITIONS — Authoritative transition map (AGENTS.md §5.2)
// Terminal states (completed, cancelled, no_show, rescheduled) have empty arrays.
// Any mutation outside this matrix is a catastrophic bug.
// ============================================================================
export const VALID_TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  pending: ['confirmed', 'cancelled', 'rescheduled'],
  confirmed: ['in_service', 'cancelled', 'rescheduled', 'no_show'],
  in_service: ['completed', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
  rescheduled: [],
} as const;

// Legacy alias for backwards compatibility
/** @deprecated Use VALID_TRANSITIONS instead */
export const STATE_MACHINE: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = VALID_TRANSITIONS;

// ============================================================================
// validateTransition — Golang-style error tuple return
// Returns [Error | null, true | null]. No throw. No exceptions.
// ============================================================================
export function validateTransition(
  current: BookingStatus,
  next: BookingStatus,
): [Error | null, true | null] {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed?.includes(next)) {
    return [
      new Error(`invalid_transition: ${current} -> ${next}`),
      null,
    ];
  }
  return [null, true];
}
