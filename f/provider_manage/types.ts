import { z } from 'zod';

export const InputSchema = z.object({
  action: z.enum([
    'create_provider', 'update_provider', 'list_providers',
    'create_service', 'update_service', 'list_services',
    'set_schedule', 'remove_schedule',
    'set_override', 'remove_override',
  ]),
  provider_id: z.uuid().optional(),
  name: z.string().min(1).max(200).optional(),
  email: z.email().optional(),
  phone: z.string().max(50).optional(),
  specialty: z.string().max(100).optional(),
  timezone: z.string().optional(),
  is_active: z.boolean().optional(),
  service_id: z.uuid().optional(),
  service_name: z.string().max(200).optional(),
  description: z.string().optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  buffer_minutes: z.number().int().min(0).max(120).optional(),
  price_cents: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  day_of_week: z.number().int().min(0).max(6).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  override_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  is_blocked: z.boolean().optional(),
  override_reason: z.string().optional(),
});

export type Input = z.infer<typeof InputSchema>;
