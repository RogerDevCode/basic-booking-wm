import { type GCalEventsResponse } from "./types.ts";

export function isGCalEventsResponse(data: unknown): data is GCalEventsResponse {
    return typeof data === 'object' && data !== null && (
    'items' in (data as Record<string, unknown>) ||
    'nextSyncToken' in (data as Record<string, unknown>)
    );
}
