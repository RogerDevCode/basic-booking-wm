// ============================================================================
// GCal WEBHOOK RECEIVER — Process incoming Google Calendar push notifications
// ============================================================================
// Receives POST requests from Google Calendar push notification channels.
// On notification: fetches changed events, reconciles with DB bookings.
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  headers: z.record(z.string(), z.string()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
  raw_channel_id: z.string().optional(),
});

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';

interface GCalEventItem {
  readonly id?: string;
  readonly status?: string;
  readonly description?: string;
  readonly summary?: string;
  readonly start?: { readonly dateTime?: string; readonly date?: string };
  readonly end?: { readonly dateTime?: string; readonly date?: string };
}

interface GCalEventsResponse {
  readonly items?: readonly GCalEventItem[];
  readonly nextSyncToken?: string;
  readonly nextPageToken?: string;
}

interface GCalFetchResult {
  readonly events: readonly GCalEventItem[];
  readonly nextSyncToken: string | null;
  readonly error: string | null;
}

interface WebhookResult {
  readonly acknowledged: boolean;
  readonly reason?: string;
  readonly changes_count?: number;
  readonly changes?: readonly { booking_id: string | null; event_id: string; status: string; action: string }[];
}

function isGCalEventsResponse(data: unknown): data is GCalEventsResponse {
  return typeof data === 'object' && data !== null && (
    'items' in (data as Record<string, unknown>) ||
    'nextSyncToken' in (data as Record<string, unknown>)
  );
}

async function fetchCalendarEvents(
  calendarId: string,
  accessToken: string,
  syncToken: string | null
): Promise<GCalFetchResult> {
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

export async function main(rawInput: unknown): Promise<[Error | null, WebhookResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  const accessToken = process.env['GCAL_ACCESS_TOKEN'];
  if (dbUrl === undefined || dbUrl === '' || accessToken === undefined || accessToken === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL and GCAL_ACCESS_TOKEN required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const headers = input.headers;
    const channelId = input.raw_channel_id ?? (headers !== undefined ? headers['X-Goog-Channel-Id'] : undefined);

    if (channelId === undefined) {
      return [new Error('Missing X-Goog-Channel-Id header'), null];
    }

    const tenantId = channelId || '00000000-0000-0000-0000-000000000000';

    const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
      const providerRows = await tx.values<[string, string | null][]>`
        SELECT provider_id, gcal_calendar_id FROM providers
        WHERE gcal_calendar_id IS NOT NULL
      `;

      let targetProvider: { provider_id: string; gcal_calendar_id: string | null } | null = null;
      for (const row of providerRows) {
        if (row[0] === channelId) {
          targetProvider = { provider_id: row[0], gcal_calendar_id: row[1] };
          break;
        }
      }

      if (targetProvider === null) {
        return [null, { acknowledged: true, reason: 'Unknown channel' }];
      }

      const calendarId = targetProvider.gcal_calendar_id;
      if (calendarId == null) {
        return [null, { acknowledged: true, reason: 'No calendar configured' }];
      }
      const result = await fetchCalendarEvents(calendarId, accessToken, null);
      if (result.error !== null) {
        return [new Error('GCal fetch error: ' + result.error), null];
      }

      const changes: { booking_id: string | null; event_id: string; status: string; action: string }[] = [];

      for (const event of result.events) {
        const eventId = typeof event.id === 'string' ? event.id : '';
        const status = typeof event.status === 'string' ? event.status : 'confirmed';
        const description = typeof event.description === 'string' ? event.description : '';

        const match = /ID de cita:\s*`?([0-9a-f-]+)`?/i.exec(description);
        const bookingId: string | null = match?.[1] ?? null;

        if (status === 'cancelled') {
          changes.push({ booking_id: bookingId, event_id: eventId, status, action: 'deleted' });
        } else if (bookingId !== null) {
          changes.push({ booking_id: bookingId, event_id: eventId, status, action: 'modified' });
        }
      }

      if (result.nextSyncToken !== null) {
        const configKey = 'gcal_sync_token_' + channelId;
        await tx`
          INSERT INTO system_config (config_key, config_value)
          VALUES (${configKey}, ${JSON.stringify({ token: result.nextSyncToken, updated_at: new Date().toISOString() })}::jsonb)
          ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = NOW()
        `;
      }

      const result: WebhookResult = { acknowledged: true, changes_count: changes.length, changes };
      return [null, result];
    });

    if (txErr !== null) return [txErr, null];
    if (txData === null) return [new Error('Webhook processing failed'), null];
    return [null, txData];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
