import type { Result } from '../internal/result/index.ts';

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';

export async function callGCalAPI(method: string, path: string, calendarId: string, accessToken: string, body?: object): Promise<Result<Readonly<Record<string, unknown>>>> {
    const url = `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/${path}`;
    try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : null,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return [new Error(`GCal API ${String(response.status)}: ${errorText}`), null];
    }

    if (method === 'DELETE') {
      return [null, {}];
    }

    const data = await response.json();
    if (typeof data !== 'object' || data === null) {
      return [new Error('GCal API returned non-object response'), null];
    }
    return [null, data as Readonly<Record<string, unknown>>];
    } catch (e) {
    return [new Error(`Network error: ${e instanceof Error ? e.message : String(e)}`), null];
    }
}
