import { z } from 'zod';
import { createDbClient } from '../internal/db/client';

export type Input = z.infer<typeof InputSchema>;
export type DB = ReturnType<typeof createDbClient>;

export interface BookingResult {
    readonly booking_id: string;
    readonly status: string;
    readonly message: string;
}

export const InputSchema = z.object({
      action: z.enum(['crear', 'cancelar', 'reagendar']),
      user_id: z.uuid(),
      booking_id: z.uuid().optional(),
      provider_id: z.uuid().optional(),
      service_id: z.uuid().optional(),
      start_time: z.string().optional(),
      cancellation_reason: z.string().max(500).optional(),
      idempotency_key: z.string().min(1).max(255).optional(),
    });
