import { z } from 'zod';

export interface GCalEventItem {
    readonly id?: string;
    readonly status?: string;
    readonly description?: string;
    readonly summary?: string;
    readonly start?: { readonly dateTime?: string; readonly date?: string };
    readonly end?: { readonly dateTime?: string; readonly date?: string };
}

export interface GCalEventsResponse {
    readonly items?: readonly GCalEventItem[];
    readonly nextSyncToken?: string;
    readonly nextPageToken?: string;
}

export interface GCalFetchResult {
    readonly events: readonly GCalEventItem[];
    readonly nextSyncToken: string | null;
    readonly error: string | null;
}

export interface WebhookResult {
    readonly acknowledged: boolean;
    readonly reason?: string;
    readonly changes_count?: number;
    readonly changes?: readonly { booking_id: string | null; event_id: string; status: string; action: string }[];
}

export const InputSchema = z.object({
      headers: z.record(z.string(), z.string()).optional(),
      body: z.record(z.string(), z.unknown()).optional(),
      raw_channel_id: z.string().optional(),
    });
