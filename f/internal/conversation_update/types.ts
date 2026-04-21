import { z } from 'zod';
import { BookingStateSchema, DraftBookingSchema } from '../booking_fsm';

export const InputSchema = z.object({
  chat_id: z.string().min(1),
  intent: z.string(),
  entities: z.record(z.string(), z.string().nullable()).default({}),
  flow_step: z.number().int().min(0).optional(),
  booking_state: BookingStateSchema.nullable().optional(),
  booking_draft: DraftBookingSchema.nullable().optional(),
  message_id: z.number().int().nullable().optional(),
}).readonly();

export type UpdateInput = z.infer<typeof InputSchema>;

export interface UpdateOutput {
  readonly success: boolean;
  readonly data: { updated: boolean };
  readonly error_message: string | null;
}
