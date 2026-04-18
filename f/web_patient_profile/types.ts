import { z } from 'zod';

export type Input = z.infer<typeof InputSchema>;

export interface ProfileResult {
    readonly client_id: string;
    readonly name: string;
    readonly email: string | null;
    readonly phone: string | null;
    readonly telegram_chat_id: string | null;
    readonly timezone: string;
    readonly gcal_calendar_id: string | null;
}

export const InputSchema = z.object({
      user_id: z.uuid(),
      action: z.enum(['get', 'update']).default('get'),
      name: z.string().min(1).max(200).optional(),
      email: z.email().optional(), // Improved email validation
      phone: z.string().max(50).optional(),
      timezone: z.string().optional(),
    });
