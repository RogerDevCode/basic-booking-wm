import postgres from 'postgres';
import { z } from 'zod';
import type { BookingEventData } from '../internal/gcal_utils/buildGCalEvent';

export type Sql = postgres.Sql;
export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface GCalSyncResult {
    readonly booking_id: string;
    readonly provider_event_id: string | null;
    readonly client_event_id: string | null;
    readonly sync_status: 'synced' | 'partial' | 'pending';
    readonly retry_count: number;
    readonly errors: readonly string[];
}

export interface BookingDetails extends BookingEventData {
    readonly provider_id: string;
    readonly gcal_provider_event_id: string | null;
    readonly gcal_client_event_id: string | null;
    readonly provider_calendar_id: string | null;
    readonly provider_gcal_access_token: string | null;
    readonly provider_gcal_refresh_token: string | null;
    readonly provider_gcal_client_id: string | null;
    readonly provider_gcal_client_secret: string | null;
    readonly client_calendar_id: string | null;
}

export const InputSchema = z.object({
      booking_id: z.uuid(),
      action: z.enum(['create', 'update', 'delete']).default('create'),
      max_retries: z.number().int().min(1).max(5).default(3),
      tenant_id: z.uuid(),
    });
