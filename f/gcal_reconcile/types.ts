import { z } from 'zod';

export const InputSchema = z.object({
  dry_run: z.boolean().optional().default(false),
  max_retries: z.number().int().min(1).max(5).default(3),
  batch_size: z.number().int().min(1).max(100).default(50),
  max_gcal_retries: z.number().int().min(1).max(20).default(10),
});

export type ReconcileInput = z.infer<typeof InputSchema>;

export interface ReconcileResult {
  processed: number;
  synced: number;
  partial: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export interface BookingRow {
  booking_id: string;
  status: string;
  start_time: Date | string;
  end_time: Date | string;
  gcal_provider_event_id: string | null;
  gcal_client_event_id: string | null;
  gcal_retry_count: number;
  provider_name: string;
  provider_calendar_id: string | null;
  client_name: string;
  client_calendar_id: string | null;
  service_name: string;
}

// Zod schema for GCal event response
export const GCalEventSchema = z.object({
  id: z.string().optional(),
  status: z.string().optional(),
  htmlLink: z.string().optional(),
  summary: z.string().optional(),
}).loose();

export type GCalEventData = z.infer<typeof GCalEventSchema>;

export interface GCalAPIResult {
  readonly ok: boolean;
  readonly data?: GCalEventData;
  readonly error?: string;
}

export interface SyncResult {
  providerEventId: string | null;
  clientEventId: string | null;
  errors: string[];
}
