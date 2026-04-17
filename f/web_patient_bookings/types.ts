import { z } from 'zod';

export const InputSchema = z.object({
  client_user_id: z.uuid(),
  status: z.enum(['all', 'pendiente', 'confirmada', 'en_servicio', 'completada', 'cancelada', 'no_presentado', 'reagendada']).default('all'),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export type InputParams = Readonly<z.infer<typeof InputSchema>>;

export interface BookingInfo {
  readonly booking_id: string;
  readonly provider_name: string | null;
  readonly provider_specialty: string;
  readonly service_name: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly status: string;
  readonly cancellation_reason: string | null;
  readonly can_cancel: boolean;
  readonly can_reschedule: boolean;
}

export interface BookingsResult {
  readonly upcoming: readonly BookingInfo[];
  readonly past: readonly BookingInfo[];
  readonly total: number;
}

// Type for raw SQL values results to avoid 'unknown' indexing issues
export type RawBookingRow = [string, string, string, string, string | null, string | null, string, string];
