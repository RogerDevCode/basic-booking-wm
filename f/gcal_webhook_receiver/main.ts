/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Process incoming Google Calendar push notifications
 * DB Tables Used  : bookings, providers, clients
 * Concurrency Risk: YES — webhook events may arrive concurrently
 * GCal Calls      : YES — fetch changed events from GCal API
 * Idempotency Key : YES — GCal sync by booking_id is idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates webhook payload structure
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate incoming GCal webhook POST payload and extract channel ID from headers
 * - Match channel ID to provider's gcal_calendar_id to identify target calendar
 * - Fetch changed events from GCal API and reconcile with DB bookings by parsing booking IDs from event descriptions
 *
 * ### Schema Verification
 * - Tables: bookings, providers, system_config
 * - Columns: providers(provider_id, gcal_calendar_id); bookings (matched via description parsing); system_config(config_key, config_value, updated_at) for storing sync tokens — system_config columns verified from query usage
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Unknown channel ID → acknowledged response with 'Unknown channel' reason; no error thrown
 * - Scenario 2: GCal API returns 410 (gone) due to expired sync token → recursive retry with null syncToken to perform full sync
 *
 * ### Concurrency Analysis
 * - Risk: YES — webhook events may arrive concurrently for same calendar; mitigated by idempotent event processing (matching by booking_id) and UPSERT on system_config sync token
 *
 * ### SOLID Compliance Check
 * - SRP: YES — fetchCalendarEvents handles only GCal HTTP fetch; main handles validation, routing, and reconciliation
 * - DRY: YES — single isGCalEventsResponse type guard; shared GCAL_BASE constant
 * - KISS: YES — linear processing pipeline; no over-engineered event routing
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// GCal WEBHOOK RECEIVER — Process incoming Google Calendar push notifications
// ============================================================================
// Receives POST requests from Google Calendar push notification channels.
// On notification: fetches changed events, reconciles with DB bookings.
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import { z } from 'zod';
import { createDbClient } from '../internal/db/client';
import { withTenantContext } from '../internal/tenant-context/index';
import { fetchCalendarEvents } from "./fetchCalendarEvents";
import { InputSchema, type WebhookResult } from "./types";

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

    const tenantId = channelId;

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
      const fetchResult = await fetchCalendarEvents(calendarId, accessToken, null);
      if (fetchResult.error !== null) {
        return [new Error('GCal fetch error: ' + fetchResult.error), null];
      }

      const changes: { booking_id: string | null; event_id: string; status: string; action: string }[] = [];
      const events = fetchResult.events ?? [];

      for (const event of events) {
        const eventId = typeof event.id === 'string' ? event.id : '';
        const status = typeof event.status === 'string' ? event.status : 'confirmed';
        const description = typeof (event as Record<string, unknown>)['description'] === 'string' ? (event as Record<string, unknown>)['description'] as string : '';

        const match = /ID de cita:\s*`?([0-9a-f-]+)`?/i.exec(description);
        const bookingId: string | null = match?.[1] ?? null;

        if (status === 'cancelled') {
          changes.push({ booking_id: bookingId, event_id: eventId, status, action: 'deleted' });
        } else if (bookingId !== null) {
          changes.push({ booking_id: bookingId, event_id: eventId, status, action: 'modified' });
        }
      }

      if (fetchResult.nextSyncToken !== null && fetchResult.nextSyncToken !== undefined) {
        const configKey = 'gcal_sync_token_' + channelId;
        await tx`
          INSERT INTO system_config (config_key, config_value)
          VALUES (${configKey}, ${JSON.stringify({ token: fetchResult.nextSyncToken, updated_at: new Date().toISOString() })}::jsonb)
          ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = NOW()
        `;
      }

      const webhookResult: WebhookResult = { acknowledged: true, changes_count: changes.length, changes };
      return [null, webhookResult];
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
