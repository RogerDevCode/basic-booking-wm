// ============================================================================
// GCal RECONCILE — Cron job to retry pending GCal syncs
// ============================================================================
// Runs every 5 minutes via Windmill Schedule (cron: */5 * * * *)
// Finds bookings with gcal_sync_status IN ('pending', 'partial')
// and retries GCal sync with exponential backoff.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { buildGCalEvent } from '../internal/gcal_utils/buildGCalEvent';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  dry_run: z.boolean().optional().default(false),
  max_retries: z.number().int().min(1).max(5).default(3),
  batch_size: z.number().int().min(1).max(100).default(50),
  max_gcal_retries: z.number().int().min(1).max(20).default(10),
});

interface ReconcileResult {
  processed: number;
  synced: number;
  partial: number;
  failed: number;
  skipped: number;
  errors: string[];
}

interface BookingRow {
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

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';

interface GCalDateTime {
  readonly dateTime?: string;
  readonly timeZone?: string;
}

interface GCalEventResponse {
  readonly id?: string;
  readonly status?: string;
  readonly htmlLink?: string;
  readonly summary?: string;
  readonly start?: GCalDateTime;
  readonly end?: GCalDateTime;
}

interface GCalAPIResult {
  readonly ok: boolean;
  readonly data?: GCalEventResponse;
  readonly error?: string;
}

async function callGCalAPI(
  method: string,
  calendarId: string,
  path: string,
  body?: object
): Promise<GCalAPIResult> {
  const accessToken = process.env['GCAL_ACCESS_TOKEN'];
  if (!accessToken) {
    return { ok: false, error: 'GCAL_ACCESS_TOKEN not configured' };
  }

  const url = `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/${path}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : null,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return { ok: false, error: `GCal API ${String(response.status)}: ${errorText}` };
    }

    const data = (await response.json()) as GCalEventResponse;
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: `Network error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function retryWithBackoff<T>(
  fn: () => Promise<{ ok: boolean; data?: T; error?: string }>,
  maxRetries: number
): Promise<{ ok: boolean; data?: T; error?: string }> {
  let lastError = 'Unknown error';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await fn();
    if (result.ok) return result;

    lastError = result.error ?? 'Unknown error';

    if (lastError.includes('(permanent)')) return result;

    if (attempt < maxRetries - 1) {
      const backoffMs = Math.pow(3, attempt) * 1000;
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  return { ok: false, error: `Failed after ${String(maxRetries)} retries: ${lastError}` };
}

// buildGCalEvent is now imported from f/internal/gcal_utils/buildGCalEvent.ts

async function syncBookingToGCal(
  booking: BookingRow,
  maxRetries: number
): Promise<{ providerEventId: string | null; clientEventId: string | null; errors: string[] }> {
  const result = {
    providerEventId: booking.gcal_provider_event_id,
    clientEventId: booking.gcal_client_event_id,
    errors: [],
  };

  const eventBody = buildGCalEvent({
    booking_id: booking.booking_id,
    status: booking.status,
    start_time: typeof booking.start_time === 'string' ? booking.start_time : booking.start_time.toISOString(),
    end_time: typeof booking.end_time === 'string' ? booking.end_time : booking.end_time.toISOString(),
    provider_name: booking.provider_name,
    service_name: booking.service_name,
  });

  // Sync to provider calendar
  if (booking.provider_calendar_id) {
    const providerCalId = booking.provider_calendar_id;
    const providerResult = await retryWithBackoff(
      () => {
        if (result.providerEventId) {
          return callGCalAPI('PUT', providerCalId, `events/${result.providerEventId}`, eventBody);
        }
        return callGCalAPI('POST', providerCalId, 'events', eventBody);
      },
      maxRetries
    );

    if (providerResult.ok && providerResult.data) {
      result.providerEventId = providerResult.data.id ?? null;
    } else {
      result.errors.push(`Provider: ${providerResult.error ?? 'Unknown error'}`);
    }
  }

  // Sync to client calendar
  if (booking.client_calendar_id) {
    const clientCalId = booking.client_calendar_id;
    const clientResult = await retryWithBackoff(
      () => {
        if (result.clientEventId) {
          return callGCalAPI('PUT', clientCalId, `events/${result.clientEventId}`, eventBody);
        }
        return callGCalAPI('POST', clientCalId, 'events', eventBody);
      },
      maxRetries
    );

    if (clientResult.ok && clientResult.data) {
      result.clientEventId = clientResult.data.id ?? null;
    } else {
      result.errors.push(`Client: ${clientResult.error ?? 'Unknown error'}`);
    }
  }

  // Handle cancelled bookings - delete events
  if (booking.status === 'cancelled') {
    if (result.providerEventId && booking.provider_calendar_id) {
      const providerCalId = booking.provider_calendar_id;
      const eventId = result.providerEventId;
      const deleteResult = await retryWithBackoff(
        () => callGCalAPI('DELETE', providerCalId, `events/${eventId}`),
        maxRetries
      );
      if (deleteResult.ok) {
        result.providerEventId = null;
      } else {
        result.errors.push(`Provider delete: ${deleteResult.error ?? 'Unknown error'}`);
      }
    }
    if (result.clientEventId && booking.client_calendar_id) {
      const clientCalId = booking.client_calendar_id;
      const eventId = result.clientEventId;
      const deleteResult = await retryWithBackoff(
        () => callGCalAPI('DELETE', clientCalId, `events/${eventId}`),
        maxRetries
      );
      if (deleteResult.ok) {
        result.clientEventId = null;
      } else {
        result.errors.push(`Client delete: ${deleteResult.error ?? 'Unknown error'}`);
      }
    }
  }

  return result;
}

export async function main(rawInput: unknown): Promise<[Error | null, ReconcileResult | null]> {
  try {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return [new Error(`Validation error: ${parsed.error.message}`), null];
    }

    const { dry_run, max_retries, batch_size, max_gcal_retries } = parsed.data;

    const dbUrl = process.env['DATABASE_URL'];
    if (!dbUrl) {
      return [new Error('DATABASE_URL not configured'), null];
    }

    const sql = createDbClient({ url: dbUrl });
    const tenantId = '00000000-0000-0000-0000-000000000000';

    try {
      const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
        // Fetch pending bookings
        const bookings = await tx<BookingRow[]>`
          SELECT b.booking_id, b.status, b.start_time, b.end_time,
                 b.gcal_provider_event_id, b.gcal_client_event_id,
                 b.gcal_retry_count,
                 p.name as provider_name, p.gcal_calendar_id as provider_calendar_id,
                 pt.name as client_name, pt.gcal_calendar_id as client_calendar_id,
                 s.name as service_name
          FROM bookings b
          JOIN providers p ON p.provider_id = b.provider_id
          JOIN clients pt ON pt.client_id = b.client_id
          JOIN services s ON s.service_id = b.service_id
          WHERE b.gcal_sync_status IN ('pending', 'partial')
            AND b.gcal_retry_count < ${max_gcal_retries}
          ORDER BY b.created_at ASC
          LIMIT ${batch_size}
        `;

        const result: ReconcileResult = {
          processed: 0,
          synced: 0,
          partial: 0,
          failed: 0,
          skipped: 0,
          errors: [],
        };

        for (const booking of bookings) {
          result.processed++;

          if (dry_run) {
            result.skipped++;
            continue;
          }

          const syncResult = await syncBookingToGCal(booking, max_retries);

          let syncStatus: string;
          if (syncResult.errors.length === 0) {
            syncStatus = 'synced';
            result.synced++;
          } else if (syncResult.providerEventId || syncResult.clientEventId) {
            syncStatus = 'partial';
            result.partial++;
          } else {
            syncStatus = 'pending';
            result.failed++;
          }

          if (syncResult.errors.length > 0) {
            result.errors.push(`Booking ${booking.booking_id}: ${syncResult.errors.join('; ')}`);
          }

          await tx`
            UPDATE bookings
            SET gcal_provider_event_id = ${syncResult.providerEventId},
                gcal_client_event_id = ${syncResult.clientEventId},
                gcal_sync_status = ${syncStatus},
                gcal_retry_count = gcal_retry_count + 1,
                gcal_last_sync = NOW()
            WHERE booking_id = ${booking.booking_id}::uuid
          `;
        }

        return [null, result];
      });

      if (txErr !== null) {
        return [txErr, null];
      }

      return [null, txData];
    } finally {
      await sql.end();
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return [new Error(`Internal error: ${error.message}`), null];
  }
}
