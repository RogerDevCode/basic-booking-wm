import { z } from 'zod';

export const InputSchema = z.object({
  action: z.enum(['join', 'leave', 'list', 'check_position']),
  user_id: z.uuid(),
  client_id: z.uuid().optional(),
  service_id: z.uuid().optional(),
  waitlist_id: z.uuid().optional(),
  preferred_date: z.string().optional(),
  preferred_start_time: z.string().optional(),
  preferred_end_time: z.string().optional(),
});

export type Input = z.infer<typeof InputSchema>;

export interface WaitlistEntry {
  readonly waitlist_id: string;
  readonly service_id: string;
  readonly preferred_date: string | null;
  readonly preferred_start_time: string | null;
  readonly status: string;
  readonly position: number;
  readonly created_at: string;
}

export interface WaitlistResult {
  readonly entries: readonly WaitlistEntry[];
  readonly position: number | null;
  readonly message: string;
}

export const WaitlistResultSchema = z.object({
  entries: z.array(z.object({
    waitlist_id: z.string(),
    service_id: z.string(),
    preferred_date: z.string().nullable(),
    preferred_start_time: z.string().nullable(),
    status: z.string(),
    position: z.number(),
    created_at: z.string(),
  })),
  position: z.number().nullable(),
  message: z.string(),
});
