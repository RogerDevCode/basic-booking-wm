import { z } from 'zod';
import type { UUID, BookingStatus } from '../internal/db-types/index.ts';

// ─── Input Validation ───────────────────────────────────────────────────────
export const InputSchema = z.object({
  booking_id: z.uuid(),
  actor: z.enum(['client', 'provider', 'system']),
  actor_id: z.uuid().optional(),
  reason: z.string().max(500).optional(),
});

export type CancelBookingInput = z.infer<typeof InputSchema>;

// ─── Output Types ───────────────────────────────────────────────────────────
export interface CancelResult {
  readonly booking_id: UUID;
  readonly previous_status: string;
  readonly new_status: string;
  readonly cancelled_by: string;
  readonly cancellation_reason: string | null;
}

// ─── Typed Row Interfaces ───────────────────────────────────────────────────
export interface BookingLookup {
  readonly booking_id: string;
  readonly status: BookingStatus;
  readonly client_id: string;
  readonly provider_id: string;
  readonly gcal_provider_event_id: string | null;
  readonly gcal_client_event_id: string | null;
}

export interface UpdatedBooking {
  readonly booking_id: string;
  readonly status: string;
  readonly cancelled_by: string;
  readonly cancellation_reason: string | null;
}
