// ============================================================================
// GCal WEBHOOK RECEIVER — Process incoming Google Calendar push notifications
// ============================================================================
// Receives POST requests from Google Calendar push notification channels.
// On notification: fetches changed events, reconciles with DB bookings.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  headers: z.record(z.string(), z.string()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
  raw_channel_id: z.string().optional(),
});

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';

async function fetchCalendarEvents(
  calendarId: string,
  accessToken: string,
  syncToken: string | null
): Promise<{ events: Record<string, unknown>[]; nextSyncToken: string | null; error: string | null }> {
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

    const data = await response.json() as Record<string, unknown>;
    const events = (data['items'] ?? []) as Record<string, unknown>[];
    const nextSyncToken = typeof data['nextSyncToken'] === 'string' ? data['nextSyncToken'] : null;
    return { events: events, nextSyncToken: nextSyncToken, error: null };
  } catch (e) {
    return { events: [], nextSyncToken: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: Record<string, unknown> | null;
  error_message: string | null;
}> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, data: null, error_message: 'Validation error: ' + parsed.error.message };
  }

  const input = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  const accessToken = process.env['GCAL_ACCESS_TOKEN'];
  if (dbUrl === undefined || dbUrl === '' || accessToken === undefined || accessToken === '') {
    return { success: false, data: null, error_message: 'CONFIGURATION_ERROR: DATABASE_URL and GCAL_ACCESS_TOKEN required' };
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    const headers = input.headers;
    const channelId = input.raw_channel_id ?? (headers !== undefined ? headers['X-Goog-Channel-Id'] : undefined);
    if (channelId === undefined) {
      return { success: false, data: null, error_message: 'Missing X-Goog-Channel-Id header' };
    }

    const providerRows = await sql`
      SELECT provider_id, gcal_calendar_id FROM providers
      WHERE gcal_calendar_id IS NOT NULL
    `;

    let targetProvider: Record<string, unknown> | null = null;
    for (const r of providerRows) {
      const row = r as Record<string, unknown>;
      if (String(row['provider_id']) === channelId) {
        targetProvider = row;
        break;
      }
    }

    if (targetProvider === null) {
      return { success: true, data: { acknowledged: true, reason: 'Unknown channel' }, error_message: null };
    }

    const calendarId = String(targetProvider['gcal_calendar_id']);
    const result = await fetchCalendarEvents(calendarId, accessToken, null);
    if (result.error !== null) {
      return { success: false, data: null, error_message: 'GCal fetch error: ' + result.error };
    }

    const changes: { booking_id: string | null; event_id: string; status: string; action: string }[] = [];

    for (const event of result.events) {
      const eventId = typeof event['id'] === 'string' ? event['id'] : '';
      const status = typeof event['status'] === 'string' ? event['status'] : 'confirmed';
      const description = typeof event['description'] === 'string' ? event['description'] : '';

      const match = /ID de cita:\s*`?([0-9a-f-]+)`?/i.exec(description);
      const bookingId: string | null = match?.[1] ?? null;

      if (status === 'cancelled') {
        changes.push({ booking_id: bookingId, event_id: eventId, status: status, action: 'deleted' });
      } else if (bookingId !== null) {
        changes.push({ booking_id: bookingId, event_id: eventId, status: status, action: 'modified' });
      }
    }

    if (result.nextSyncToken !== null) {
      const configKey = 'gcal_sync_token_' + channelId;
      await sql`
        INSERT INTO system_config (config_key, config_value)
        VALUES (${configKey}, ${JSON.stringify({ token: result.nextSyncToken, updated_at: new Date().toISOString() })}::jsonb)
        ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = NOW()
      `;
    }

    return {
      success: true,
      data: { acknowledged: true, changes_count: changes.length, changes: changes },
      error_message: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: 'Internal error: ' + message };
  } finally {
    await sql.end();
  }
}
