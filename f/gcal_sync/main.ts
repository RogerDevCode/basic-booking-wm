/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Sync booking to Google Calendar (provider + client)
 * DB Tables Used  : bookings, providers, clients, services
 * Concurrency Risk: NO — single booking read, no locks needed
 * GCal Calls      : YES — retryWithBackoff (3 attempts, 500ms*2^attempt)
 * Idempotency Key : N/A — read-only + update by booking_id
 * RLS Tenant ID   : YES — withTenantContext wraps DB ops
 * Zod Schemas     : YES — InputSchema validates all inputs
 */

/**
 * REASONING TRACE
 * ### Mission Decomposition
 * - DECOMPOSITION: 
 *   1. Fetch booking and related entity data from DB.
 *   2. Resolve valid GCal access token for provider.
 *   3. Synchronize event on provider calendar.
 *   4. Synchronize event on client calendar.
 *   5. Update booking record with results.
 *
 * ### Schema Verification
 * - Tables: bookings, providers, clients, services
 * - Columns: verified against §6 (booking_id, provider_id, gcal_provider_event_id, etc.)
 *
 * ### Failure Mode Analysis
 * - Token resolution failure → abort with error.
 * - GCal API failure (provider or client) → mark as 'partial' or 'pending', log error.
 * - DB update failure → return error (handled by windmill retry if configured).
 *
 * ### Concurrency Analysis
 * - No risk identified; sequential execution outside long-lived DB transactions.
 *
 * ### SOLID Compliance Check
 * - SRP: Split into fetch, sync, and update functions.
 * - DRY: Uses shared GCal and Result utilities.
 * - KISS: Clear sequential flow, no over-engineering.
 * - DIP: Business logic depends on Sql interface.
 *
 * → CLEARED FOR CODE GENERATION
 */

import { z } from 'zod';
import postgres from 'postgres';
import { buildGCalEvent } from '../internal/gcal_utils/buildGCalEvent';
import type { BookingEventData } from '../internal/gcal_utils/buildGCalEvent';
import { getValidAccessToken } from '../internal/gcal_utils/oauth';
import { retryWithBackoff, isPermanentError } from '../internal/retry';
import { createDbClient } from '../internal/db/client';
import { withTenantContext } from '../internal/tenant-context';
import type { Result } from '../internal/result';

type Sql = postgres.Sql;

// --- Schemas & Types --------------------------------------------------------

const InputSchema = z.object({
  booking_id: z.uuid(),
  action: z.enum(['create', 'update', 'delete']).default('create'),
  max_retries: z.number().int().min(1).max(5).default(3),
  tenant_id: z.uuid(),
});

type Input = Readonly<z.infer<typeof InputSchema>>;

export interface GCalSyncResult {
  readonly booking_id: string;
  readonly provider_event_id: string | null;
  readonly client_event_id: string | null;
  readonly sync_status: 'synced' | 'partial' | 'pending';
  readonly retry_count: number;
  readonly errors: readonly string[];
}

interface BookingDetails extends BookingEventData {
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

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';

// --- Database Operations ----------------------------------------------------

async function fetchBookingDetails(
  sql: Sql,
  tenantId: string,
  bookingId: string
): Promise<Result<BookingDetails>> {
  return withTenantContext(sql, tenantId, async (tx) => {
    const rows = await tx`
      SELECT b.booking_id, b.provider_id, b.status, b.start_time, b.end_time,
             b.gcal_provider_event_id, b.gcal_client_event_id,
             p.name as provider_name, p.gcal_calendar_id as provider_calendar_id,
             p.gcal_access_token as provider_gcal_access_token,
             p.gcal_refresh_token as provider_gcal_refresh_token,
             p.gcal_client_id as provider_gcal_client_id,
             p.gcal_client_secret as provider_gcal_client_secret,
             pt.name as client_name, pt.gcal_calendar_id as client_calendar_id,
             s.name as service_name
      FROM bookings b
      JOIN providers p ON p.provider_id = b.provider_id
      JOIN clients pt ON pt.client_id = b.client_id
      JOIN services s ON s.service_id = b.service_id
      WHERE b.booking_id = ${bookingId}::uuid
      LIMIT 1
    `;

    if (rows.length === 0) {
      return [new Error(`Booking ${bookingId} not found`), null];
    }

    const r = rows[0];
    if (!r) {
      return [new Error(`Booking ${bookingId} row is undefined`), null];
    }
    const details: BookingDetails = {
      booking_id:             r['booking_id'],
      provider_id:            r['provider_id'],
      status:                 r['status'],
      start_time:             (r['start_time'] as Date).toISOString(),
      end_time:               (r['end_time'] as Date).toISOString(),
      gcal_provider_event_id: r['gcal_provider_event_id'],
      gcal_client_event_id:   r['gcal_client_event_id'],
      provider_name:          r['provider_name'],
      provider_calendar_id:   r['provider_calendar_id'],
      provider_gcal_access_token: r['provider_gcal_access_token'],
      provider_gcal_refresh_token: r['provider_gcal_refresh_token'],
      provider_gcal_client_id: r['provider_gcal_client_id'],
      provider_gcal_client_secret: r['provider_gcal_client_secret'],
      client_calendar_id:     r['client_calendar_id'],
      service_name:           r['service_name'],
    };

    return [null, details];
  });
}

async function updateBookingSyncStatus(
  sql: Sql,
  tenantId: string,
  bookingId: string,
  update: {
    providerEventId: string | null;
    clientEventId: string | null;
    status: 'synced' | 'partial' | 'pending';
    errorCount: number;
  }
): Promise<Result<void>> {
  return withTenantContext(sql, tenantId, async (tx) => {
    await tx`
      UPDATE bookings
      SET gcal_provider_event_id = ${update.providerEventId},
          gcal_client_event_id = ${update.clientEventId},
          gcal_sync_status = ${update.status},
          gcal_last_sync = NOW(),
          gcal_retry_count = ${update.errorCount > 0 ? 1 : 0}
      WHERE booking_id = ${bookingId}::uuid
    `;
    return [null, undefined];
  });
}

// --- GCal API Operations ----------------------------------------------------

async function callGCalAPI(
  method: string,
  path: string,
  calendarId: string,
  accessToken: string,
  body?: object
): Promise<Result<Readonly<Record<string, unknown>>>> {
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
      return [new Error(`GCal API ${response.status}: ${errorText}`), null];
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

async function syncEvent(
  action: 'create' | 'update' | 'delete',
  calendarId: string | null,
  eventId: string | null,
  accessToken: string,
  eventData: BookingEventData,
  maxRetries: number
): Promise<Result<string | null>> {
  if (!calendarId) return [null, null];

  const operation = async (): Promise<string | null> => {
    if (action === 'delete') {
      if (!eventId) return null;
      const [err] = await callGCalAPI('DELETE', `events/${eventId}`, calendarId, accessToken);
      if (err) throw err;
      return null;
    }

    const body = buildGCalEvent(eventData);
    const method = eventId ? 'PUT' : 'POST';
    const path = eventId ? `events/${eventId}` : 'events';

    const [err, data] = await callGCalAPI(method, path, calendarId, accessToken, body);
    if (err) throw err;

    const newId = data?.['id'];
    if (typeof newId !== 'string') throw new Error('Invalid GCal response: missing event id');
    return newId;
  };

  const result = await retryWithBackoff(operation, {
    maxAttempts: maxRetries,
    operationName: `gcal_sync_${action}`,
  });

  if (result.success) return [null, result.data];
  
  const isPermanent = isPermanentError(result.error);
  return [new Error(`${isPermanent ? 'PERMANENT: ' : ''}${result.error.message}`), null];
}

// --- Main -------------------------------------------------------------------

export async function main(
  rawInput: unknown
): Promise<Result<GCalSyncResult>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }
  const input: Input = parsed.data;

  const dbUrl = process.env['DATABASE_URL'] || '';
  if (!dbUrl) return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];

  const sql = createDbClient({ url: dbUrl });

  try {
    // 1. Fetch
    const [fetchErr, booking] = await fetchBookingDetails(sql, input.tenant_id, input.booking_id);
    if (fetchErr || !booking) return [fetchErr ?? new Error('Booking not found'), null];

    // 2. Auth
    const [authErr, accessToken] = await getValidAccessToken(
      booking.provider_id,
      {
        accessToken: booking.provider_gcal_access_token ?? process.env['GCAL_ACCESS_TOKEN'] ?? '',
        clientId: booking.provider_gcal_client_id,
        clientSecret: booking.provider_gcal_client_secret,
        refreshToken: booking.provider_gcal_refresh_token,
      },
      sql
    );
    if (authErr || !accessToken) return [authErr ?? new Error('Auth failed'), null];

    // 3. Sync
    const errors: string[] = [];
    
    const [pErr, pEventId] = await syncEvent(
      input.action,
      booking.provider_calendar_id,
      booking.gcal_provider_event_id,
      accessToken,
      booking,
      input.max_retries
    );
    if (pErr) errors.push(`Provider sync failed: ${pErr.message}`);

    const [cErr, cEventId] = await syncEvent(
      input.action,
      booking.client_calendar_id,
      booking.gcal_client_event_id,
      accessToken,
      booking,
      input.max_retries
    );
    if (cErr) errors.push(`Client sync failed: ${cErr.message}`);

    // 4. Update Status
    const syncStatus = errors.length === 0 ? 'synced' : (pEventId || cEventId ? 'partial' : 'pending');
    
    const [updateErr] = await updateBookingSyncStatus(sql, input.tenant_id, input.booking_id, {
      providerEventId: pEventId ?? (input.action === 'delete' ? null : booking.gcal_provider_event_id),
      clientEventId: cEventId ?? (input.action === 'delete' ? null : booking.gcal_client_event_id),
      status: syncStatus,
      errorCount: errors.length,
    });

    if (updateErr) return [updateErr, null];

    return [null, {
      booking_id: input.booking_id,
      provider_event_id: pEventId,
      client_event_id: cEventId,
      sync_status: syncStatus,
      retry_count: 0,
      errors,
    }];
  } catch (e) {
    return [new Error(`Fatal error: ${e instanceof Error ? e.message : String(e)}`), null];
  } finally {
    await sql.end();
  }
}
