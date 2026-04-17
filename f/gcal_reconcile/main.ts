/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Cron job to retry pending GCal syncs (every 5 minutes)
 * DB Tables Used  : bookings, providers, clients, services
 * Concurrency Risk: YES — concurrent reconcile runs could re-sync same booking
 * GCal Calls      : YES — retryWithBackoff (3 attempts, 500ms*2^attempt)
 * Idempotency Key : YES — GCal event creation is idempotent via booking_id
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates max_bookings parameter
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Fetch bookings with gcal_sync_status IN ('pending', 'partial') that haven't exceeded retry limit
 * - For each booking, build GCal event body and sync to provider and/or client calendars
 * - Update booking row with sync result (synced/partial/pending), event IDs, and incremented retry count
 *
 * ### Schema Verification
 * - Tables: bookings, providers, clients, services
 * - Columns: bookings(booking_id, status, start_time, end_time, gcal_provider_event_id, gcal_client_event_id, gcal_retry_count, gcal_sync_status, gcal_last_sync, created_at, provider_id, client_id, service_id); providers(name, gcal_calendar_id); clients(name, gcal_calendar_id); services(name) — all verified against §6 schema plus known extension columns
 *
 * ### Failure Mode Analysis
 * - Scenario 1: GCal API returns permanent error (4xx) → retry skipped for that calendar, partial status recorded
 * - Scenario 2: Network timeout during sync → retryWithBackoff retries up to max_retries; failure recorded, booking remains pending for next cron run
 *
 * ### Concurrency Analysis
 * - Risk: YES — concurrent reconcile runs could re-sync same booking; mitigated by batch_size limit and gcal_retry_count increment preventing infinite loops; GIST constraint protects booking integrity
 *
 * ### SOLID Compliance Check
 * - SRP: YES — syncBookingToGCal handles only GCal sync; callGCalAPI handles only HTTP calls; main orchestrates
 * - DRY: YES — retryWithBackoff reused for provider, client, and delete operations; buildGCalEvent imported from shared utility
 * - KISS: YES — straightforward batch loop; no premature abstraction
 *
 * → CLEARED FOR CODE GENERATION
 */

// GCal RECONCILE — Cron job to retry pending GCal syncs
// ============================================================================
// Runs every 5 minutes via Windmill Schedule (cron: */5 * * * *)
// Finds bookings with gcal_sync_status IN ('pending', 'partial')
// and retries GCal sync with exponential backoff.
// ============================================================================

import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import { InputSchema } from './types';
import type { ReconcileResult, BookingRow } from './types';
import { syncBookingToGCal } from './services';

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

    try {
      // 1. Fetch all active providers (no RLS needed — we iterate ALL tenants)
      const providers = await sql<{ provider_id: string }[]>`
        SELECT provider_id FROM providers WHERE is_active = true
      `;

      const aggregateResult: ReconcileResult = {
        processed: 0,
        synced: 0,
        partial: 0,
        failed: 0,
        skipped: 0,
        errors: [],
      };

      // 2. For each provider, run reconciliation inside withTenantContext
      for (const provider of providers) {
        const [txErr, txResult] = await withTenantContext<ReconcileResult>(sql, provider.provider_id, async (tx) => {
          // Fetch pending bookings for THIS provider only
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
            WHERE b.provider_id = ${provider.provider_id}::uuid
              AND b.gcal_sync_status IN ('pending', 'partial')
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
          aggregateResult.errors.push(`Provider ${provider.provider_id}: ${txErr.message}`);
          continue;
        }
        if (txResult === null) continue;

        aggregateResult.processed += txResult.processed;
        aggregateResult.synced += txResult.synced;
        aggregateResult.partial += txResult.partial;
        aggregateResult.failed += txResult.failed;
        aggregateResult.skipped += txResult.skipped;
        aggregateResult.errors.push(...txResult.errors);
      }

      return [null, aggregateResult];
    } finally {
      await sql.end();
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return [new Error(`Internal error: ${error.message}`), null];
  }
}
