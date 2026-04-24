//nobundling
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

import { createDbClient } from '../internal/db/client.ts';
import { getValidAccessToken } from '../internal/gcal_utils/oauth.ts';
import type { Result } from '../internal/result/index.ts';
import { fetchBookingDetails } from "./fetchBookingDetails.ts";
import { syncEvent } from "./syncEvent.ts";
import { type GCalSyncResult, type Input, InputSchema } from "./types.ts";
import { updateBookingSyncStatus } from "./updateBookingSyncStatus.ts";

// --- Schemas & Types --------------------------------------------------------


// --- Database Operations ----------------------------------------------------
// --- GCal API Operations ----------------------------------------------------
// --- Main -------------------------------------------------------------------

export async function main(args: any) : Promise<Result<GCalSyncResult>> {
const rawInput: unknown = args;
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }
  const input: Input = parsed.data;

  const dbUrl = process.env['DATABASE_URL'] ?? '';
  if (!dbUrl) return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];

  const sql = createDbClient({ url: dbUrl });

  try {
    // 1. Fetch
    const [fetchErr, booking] = await fetchBookingDetails(sql, input.tenant_id, input.booking_id);
    if (fetchErr ?? !booking) return [fetchErr ?? new Error('Booking not found'), null];

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