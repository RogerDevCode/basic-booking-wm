import { isGCalEventsResponse } from "./isGCalEventsResponse.ts";
import { type GCalFetchResult } from "./types.ts";

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';

export async function fetchCalendarEvents(calendarId: string, accessToken: string, syncToken: string | null): Promise<GCalFetchResult> {
    const url = GCAL_BASE + '/calendars/' + encodeURIComponent(calendarId) + '/events';
    const params: string[] = ['maxResults=50', 'showDeleted=true'];
    if (syncToken) params.push('syncToken=' + encodeURIComponent(syncToken));
    else params.push('timeMin=' + new Date(Date.now() - 86400000).toISOString());
    try {
    const response = await fetch(url + '?' + params.join('&'), {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const text = await response.text().catch(function(): string { return ''; });
      if (response.status === 410 && syncToken) {
        return await fetchCalendarEvents(calendarId, accessToken, null);
      }
      return { events: [], nextSyncToken: null, error: 'GCal API ' + String(response.status) + ': ' + text };
    }

    const data = await response.json();
    if (!isGCalEventsResponse(data)) {
      return { events: [], nextSyncToken: null, error: 'Invalid GCal response format' };
    }
    const events = data.items ?? [];
    const nextSyncToken = typeof data.nextSyncToken === 'string' ? data.nextSyncToken : null;
    return { events, nextSyncToken, error: null };
    } catch (e) {
    return { events: [], nextSyncToken: null, error: e instanceof Error ? e.message : String(e) };
    }
}
