// ============================================================================
// STATE MACHINE — Booking Status Transition Validator
// ============================================================================
// Implements AGENTS.md §8.1: State Machine (Strict)
// Centralized transition logic used by both application code and DB trigger.
// ============================================================================

export interface StateTransitionRule {
  readonly from: string;
  readonly to: readonly string[];
}

export const STATE_MACHINE: Record<string, readonly string[]> = {
  pending: ['confirmed', 'cancelled', 'rescheduled'],
  confirmed: ['in_service', 'cancelled', 'rescheduled'],
  'in_service': ['completed', 'no_show'],
} as const;

export type BookingStatus = keyof typeof STATE_MACHINE | 'completed' | 'no_show' | 'cancelled' | 'rescheduled';

/**
 * Validates a state transition.
 * Returns [Error | null, null].
 * If error is null, transition is valid.
 */
export function validateTransition(
  oldStatus: string,
  newStatus: string,
): [Error | null, null] {
  // No change is always valid
  if (oldStatus === newStatus) {
    return [null, null];
  }

  const allowed = STATE_MACHINE[oldStatus];
  if (allowed === undefined) {
    return [
      new Error(`Invalid state transition: ${oldStatus} -> ${newStatus} (state '${oldStatus}' is terminal or unknown)`),
      null,
    ];
  }

  if (!allowed.includes(newStatus)) {
    return [
      new Error(`Invalid state transition: ${oldStatus} -> ${newStatus}. Allowed: ${allowed.join(', ')}`),
      null,
    ];
  }

  return [null, null];
}
