import { z } from 'zod';

export const InputSchema = z.object({
  action: z.enum(['get_week', 'get_day_slots', 'block_date', 'unblock_date', 'save_schedule', 'get_provider', 'list_services', 'list_overrides', 'list_schedules']),
  provider_id: z.string().uuid().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  service_id: z.string().uuid().optional(),
  override_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  override_date_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reason: z.string().max(200).optional(),
  schedules: z.array(z.object({
    day_of_week: z.number().int().min(0).max(6),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
    is_active: z.boolean(),
  })).optional(),
});

export type Input = z.infer<typeof InputSchema>;
