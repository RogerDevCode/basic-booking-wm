import { z } from 'zod';

export const InputSchema = z.object({
  provider_id: z.uuid().optional(),
  client_id: z.uuid().optional(),
  status: z.enum(['pending', 'confirmed', 'in_service', 'completed', 'cancelled', 'no_show', 'rescheduled']).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  service_id: z.uuid().optional(),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(20),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface BookingSearchRow {
  readonly booking_id: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly status: string;
  readonly provider_name: string;
  readonly client_name: string;
  readonly service_name: string;
  readonly gcal_sync_status: string;
  readonly notification_sent: boolean;
}

export interface BookingSearchResult {
  readonly bookings: readonly BookingSearchRow[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
}