import postgres from 'postgres';
import { z } from 'zod';
import type { UUID } from '../internal/db-types/index';

export type Sql = postgres.Sql;
export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface RescheduleResult {
    readonly old_booking_id: UUID;
    readonly new_booking_id: UUID;
    readonly old_status: string;
    readonly new_status: string;
    readonly old_start_time: string;
    readonly new_start_time: string;
    readonly new_end_time: string;
}

export interface RescheduleWriteResult {
    readonly new_booking_id: UUID;
    readonly new_status: string;
    readonly new_start_time: string;
    readonly new_end_time: string;
    readonly old_booking_id: UUID;
    readonly old_status: string;
}

export const InputSchema = z.object({
      booking_id: z.uuid(),
      new_start_time: z.coerce.date(),
      new_service_id: z.uuid().optional(),
      actor: z.enum(['client', 'provider', 'system']),
      actor_id: z.uuid().optional(),
      reason: z.string().max(500).optional(),
    });
