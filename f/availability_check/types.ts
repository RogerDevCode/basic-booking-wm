import { z } from 'zod';

export const InputSchema = z.object({
  tenant_id: z.uuid(),
  provider_id: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  service_id: z.uuid().optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  buffer_minutes: z.number().int().min(0).max(120).optional(),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}

export interface AvailabilityResult {
  provider_id: string;
  provider_name: string;
  date: string;
  timezone: string;
  slots: readonly TimeSlot[];
  total_available: number;
  total_booked: number;
  is_blocked: boolean;
  block_reason: string | undefined;
}

export interface ProviderRow {
  provider_id: string;
  name: string;
  timezone: string;
}