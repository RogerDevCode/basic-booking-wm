import { z } from 'zod';

export const InputSchema = z.object({
  provider_id: z.uuid(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  include_client_details: z.boolean().default(false),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface AgendaResult {
  provider_id: string;
  provider_name: string;
  date_from: string;
  date_to: string;
  days: {
    date: string;
    is_blocked: boolean;
    block_reason?: string;
    schedule: { start_time: string; end_time: string }[];
    bookings: {
      booking_id: string;
      start_time: string;
      end_time: string;
      status: string;
      service_name: string;
      client_name?: string;
    }[];
  }[];
}