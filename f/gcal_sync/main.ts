// ============================================================================
// GCal SYNC — Sync booking to Google Calendar (provider + client)
// ============================================================================
// Uses shared retryWithBackoff from internal/retry (DRY).
// Go-style: no throw, no any, no as. Tuple return.
// Retry: 3 attempts with exponential backoff [1s, 3s, 9s]
// On failure: marks as 'pending' for reconciliation cron
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { buildGCalEvent } from '../internal/gcal_utils/buildGCalEvent';
import { retryWithBackoff } from '../internal/retry';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  booking_id: z.uuid(),
  action: z.enum(['create', 'update', 'delete']).default('create'),
  max_retries: z.number().int().min(1).max(5).default(3),
});

export interface GCalSyncResult {
  readonly booking_id: string;
  readonly provider_event_id: string | null;
  readonly client_event_id: string | null;
  readonly sync_status: 'synced' | 'partial' | 'pending';
  readonly retry_count: number;
  readonly errors: readonly string[];
}

// --- Typed Row Interface for the booking join query ---
interface BookingRow {
  readonly booking_id: string;
  readonly status: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly gcal_provider_event_id: string | null;
  readonly gcal_client_event_id: string | null;
  readonly provider_name: string;
  readonly provider_calendar_id: string | null;
  readonly client_name: string;
  readonly client_calendar_id: string | null;
  readonly service_name: string;
}

// --- GCal API Response Type Guard ---
function isGCalEventResponse(data: Record<string, unknown>): data is GCalEventResponse {
  return typeof data['id'] === 'string' && data['id'].length > 0;
}

// --- Type Guard for Record<string, unknown> ---
function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object' && data !== null && !Array.isArray(data);
}

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';

interface GCalAPIResult {
  readonly ok: boolean;
  readonly data?: Record<string, unknown>;
  readonly error?: string;
}

async function callGCalAPI(
  method: string,
  path: string,
  calendarId: string,
  body?: object
): Promise<GCalAPIResult> {
  const accessToken = process.env['GCAL_ACCESS_TOKEN'];
  if (accessToken === undefined || accessToken === '') {
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
      const isTransient = response.status >= 500 || response.status === 429;
      return {
        ok: false,
        error: `GCal API ${String(response.status)} (${isTransient ? 'transient' : 'permanent'}): ${errorText}`,
      };
    }

    const jsonData = await response.json();
    if (!isRecord(jsonData)) {
      return { ok: false, error: 'GCal API returned non-object response' };
    }
    return { ok: true, data: jsonData };
  } catch (e) {
    return { ok: false, error: `Network error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// Wrapper to adapt callGCalAPI to retryWithBackoff's expected signature
async function retryGCalOperation(
  operation: () => Promise<GCalAPIResult>,
  maxRetries: number,
  operationName: string,
): Promise<GCalAPIResult> {
  const result = await retryWithBackoff(operation, {
    maxAttempts: maxRetries,
    operationName,
  });

  if (result.success && result.data !== undefined && isRecord(result.data)) {
    return { ok: true, data: result.data };
  }

  const errorObj = result.error !== null ? result.error : new Error('Unknown error');
  return {
    ok: false,
    error: result.isPermanent
      ? `GCal API permanent error: ${errorObj.message}`
      : errorObj.message,
  };
}

// ─── Main Entry Point ───────────────────────────────────────────────────────
export async function main(
  rawInput: unknown,
): Promise<[Error | null, GCalSyncResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    // Step 1: Fetch booking details
    const bookingRows = await sql.values<[
      string, string, string, string,
      string | null, string | null,
      string, string | null,
      string, string | null,
      string,
    ][]>`
      SELECT b.booking_id, b.status, b.start_time, b.end_time,
             b.gcal_provider_event_id, b.gcal_client_event_id,
             p.name as provider_name, p.gcal_calendar_id as provider_calendar_id,
             pt.name as client_name, pt.gcal_calendar_id as client_calendar_id,
             s.name as service_name
      FROM bookings b
      JOIN providers p ON p.provider_id = b.provider_id
      JOIN clients pt ON pt.client_id = b.client_id
      JOIN services s ON s.service_id = b.service_id
      WHERE b.booking_id = ${input.booking_id}::uuid
      LIMIT 1
    `;

    const bookingRow = bookingRows[0];
    if (bookingRow === undefined) {
      return [new Error(`Booking ${input.booking_id} not found`), null];
    }

    const booking: BookingRow = {
      booking_id: bookingRow[0],
      status: bookingRow[1],
      start_time: bookingRow[2],
      end_time: bookingRow[3],
      gcal_provider_event_id: bookingRow[4],
      gcal_client_event_id: bookingRow[5],
      provider_name: bookingRow[6],
      provider_calendar_id: bookingRow[7],
      client_name: bookingRow[8],
      client_calendar_id: bookingRow[9],
      service_name: bookingRow[10],
    };

    const errors: string[] = [];
    let providerEventId: string | null = booking.gcal_provider_event_id;
    let clientEventId: string | null = booking.gcal_client_event_id;

    // Step 2: Handle delete action
    if (input.action === 'delete') {
      if (booking.gcal_provider_event_id !== null && booking.provider_calendar_id !== null) {
        const calId = booking.provider_calendar_id;
        const eventId = booking.gcal_provider_event_id;
        const deleteResult = await retryGCalOperation(
          () => callGCalAPI('DELETE', `events/${eventId}`, calId),
          input.max_retries,
          'gcal_provider_delete',
        );
        if (!deleteResult.ok) {
          errors.push(`Provider event delete failed: ${deleteResult.error ?? 'Unknown error'}`);
        } else {
          providerEventId = null;
        }
      }
      if (booking.gcal_client_event_id !== null && booking.client_calendar_id !== null) {
        const calId = booking.client_calendar_id;
        const eventId = booking.gcal_client_event_id;
        const deleteResult = await retryGCalOperation(
          () => callGCalAPI('DELETE', `events/${eventId}`, calId),
          input.max_retries,
          'gcal_client_delete',
        );
        if (!deleteResult.ok) {
          errors.push(`Client event delete failed: ${deleteResult.error ?? 'Unknown error'}`);
        } else {
          clientEventId = null;
        }
      }

      const syncStatus: 'synced' | 'partial' | 'pending' = errors.length === 0 ? 'synced' : 'partial';

      await sql`
        UPDATE bookings
        SET gcal_sync_status = ${syncStatus},
            gcal_last_sync = NOW(),
            gcal_provider_event_id = ${providerEventId},
            gcal_client_event_id = ${clientEventId}
        WHERE booking_id = ${input.booking_id}::uuid
      `;

      const result: GCalSyncResult = {
        booking_id: input.booking_id,
        provider_event_id: providerEventId,
        client_event_id: clientEventId,
        sync_status: syncStatus,
        retry_count: 0,
        errors: errors,
      };

      return [null, result];
    }

    // Build event body from shared util
    const eventBody = buildGCalEvent({
      booking_id: booking.booking_id,
      status: booking.status,
      start_time: booking.start_time,
      end_time: booking.end_time,
      provider_name: booking.provider_name,
      service_name: booking.service_name,
    });

    // Step 3: Create/update provider event
    if (booking.provider_calendar_id !== null) {
      const calId = booking.provider_calendar_id;
      const providerResult = await retryGCalOperation(
        () => {
          if (booking.gcal_provider_event_id !== null) {
            return callGCalAPI('PUT', `events/${booking.gcal_provider_event_id}`, calId, eventBody);
          }
          return callGCalAPI('POST', 'events', calId, eventBody);
        },
        input.max_retries,
        'gcal_provider_sync',
      );

      if (providerResult.ok && providerResult.data !== undefined && isGCalEventResponse(providerResult.data)) {
        providerEventId = providerResult.data.id;
      } else {
        errors.push(`Provider event failed: ${providerResult.error ?? 'Unknown error'}`);
      }
    }

    // Step 4: Create/update client event
    if (booking.client_calendar_id !== null) {
      const calId = booking.client_calendar_id;
      const clientResult = await retryGCalOperation(
        () => {
          if (booking.gcal_client_event_id !== null) {
            return callGCalAPI('PUT', `events/${booking.gcal_client_event_id}`, calId, eventBody);
          }
          return callGCalAPI('POST', 'events', calId, eventBody);
        },
        input.max_retries,
        'gcal_client_sync',
      );

      if (clientResult.ok && clientResult.data !== undefined && isGCalEventResponse(clientResult.data)) {
        clientEventId = clientResult.data.id;
      } else {
        errors.push(`Client event failed: ${clientResult.error ?? 'Unknown error'}`);
      }
    }

    // Step 5: Determine sync status
    let syncStatus: 'synced' | 'partial' | 'pending' = 'pending';
    if (errors.length === 0) {
      syncStatus = 'synced';
    } else if (providerEventId !== null || clientEventId !== null) {
      syncStatus = 'partial';
    }

    // Step 6: Update booking with GCal event IDs
    await sql`
      UPDATE bookings
      SET gcal_provider_event_id = ${providerEventId},
          gcal_client_event_id = ${clientEventId},
          gcal_sync_status = ${syncStatus},
          gcal_last_sync = NOW(),
          gcal_retry_count = ${errors.length > 0 ? 1 : 0}
      WHERE booking_id = ${input.booking_id}::uuid
    `;

    const result: GCalSyncResult = {
      booking_id: input.booking_id,
      provider_event_id: providerEventId,
      client_event_id: clientEventId,
      sync_status: syncStatus,
      retry_count: 0,
      errors: errors,
    };

    return [null, result];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error(`Internal error: ${message}`), null];
  } finally {
    await sql.end();
  }
}
