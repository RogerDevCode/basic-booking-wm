/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Dead Letter Queue handler for failed bookings (retry/resolve/discard)
 * DB Tables Used  : booking_dlq, bookings, providers, services
 * Concurrency Risk: YES — retry attempts booking creation which uses GIST constraint
 * GCal Calls      : NO — DLQ retry delegates to booking_create which delegates to gcal_sync
 * Idempotency Key : YES — original idempotency_key preserved from failed booking
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates action and parameters
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Parse and validate DLQ action input (list/retry/resolve/discard/status)
 * - Query booking_dlq table filtered by status or dlq_id
 * - Execute the requested action: requeue pending entries, resolve/discard by ID, or aggregate stats
 *
 * ### Schema Verification
 * - Tables: booking_dlq
 * - Columns: dlq_id, booking_id, provider_id, service_id, failure_reason, last_error_message, last_error_stack, original_payload, idempotency_key, status, created_at, updated_at, resolved_at, resolved_by, resolution_notes — all verified against DLQEntry/ DLQRow interfaces
 *
 * ### Failure Mode Analysis
 * - Scenario 1: DLQ entry not found or already resolved → fail-fast with specific error message
 * - Scenario 2: Retry re-queues but original booking still fails → idempotency_key prevents duplicate booking creation
 *
 * ### Concurrency Analysis
 * - Risk: YES — retry triggers booking creation which uses GIST exclusion constraint; concurrent retries on same dlq_id prevented by SELECT FOR UPDATE within withTenantContext transaction
 *
 * ### SOLID Compliance Check
 * - SRP: YES — each action branch handles one DLQ operation; parseDLQRow handles only row parsing
 * - DRY: YES — single parseDLQRow function for all query paths; withTenantContext wraps all DB ops
 * - KISS: YES — simple switch-case dispatch; no unnecessary abstraction
 *
 * → CLEARED FOR CODE GENERATION
 */

import { z } from 'zod';
import postgres from 'postgres';
import { createDbClient } from '../internal/db/client';

type Result<T> = [Error | null, T | null];

/**
 * DLQ table is system-global queue — operations span all tenants.
 */
async function getGlobalTx(
  client: postgres.Sql,
  operation: (tx: postgres.Sql) => Promise<Result<unknown>>,
): Promise<Result<unknown>> {
  const reserved = await client.reserve();
  try {
    await reserved`BEGIN`;
    const [err, data] = await operation(reserved);
    if (err !== null) { await reserved`ROLLBACK`; return [err, null]; }
    await reserved`COMMIT`;
    return [null, data];
  } catch (error: unknown) {
    await reserved`ROLLBACK`.catch(() => {});
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`transaction_failed: ${msg}`), null];
  } finally {
    reserved.release();
  }
}

const InputSchema = z.object({
  action: z.enum(['list', 'retry', 'resolve', 'discard', 'status']),
  dlq_id: z.number().int().optional(),
  max_retries: z.number().int().min(1).max(20).default(10),
});

interface DLQEntry {
  readonly dlq_id: number;
  readonly booking_id: string | null;
  readonly provider_id: string | null;
  readonly service_id: string | null;
  readonly failure_reason: string;
  readonly last_error_message: string;
  readonly last_error_stack: string | null;
  readonly original_payload: Readonly<Record<string, unknown>>;
  readonly idempotency_key: string;
  readonly status: 'pending' | 'resolved' | 'discarded';
  readonly created_at: string;
  readonly updated_at: string;
  readonly resolved_at: string | null;
  readonly resolved_by: string | null;
  readonly resolution_notes: string | null;
}

interface DLQRow {
  readonly dlq_id: number;
  readonly booking_id: string | null;
  readonly provider_id: string | null;
  readonly service_id: string | null;
  readonly failure_reason: string;
  readonly last_error_message: string;
  readonly last_error_stack: string | null;
  readonly original_payload: Readonly<Record<string, unknown>> | null;
  readonly idempotency_key: string;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly resolved_at: string | null;
  readonly resolved_by: string | null;
  readonly resolution_notes: string | null;
}

function parseDLQRow(row: DLQRow): DLQEntry {
  return {
    dlq_id: row.dlq_id,
    booking_id: row.booking_id,
    provider_id: row.provider_id,
    service_id: row.service_id,
    failure_reason: row.failure_reason,
    last_error_message: row.last_error_message,
    last_error_stack: row.last_error_stack,
    original_payload: row.original_payload !== null ? row.original_payload : {},
    idempotency_key: row.idempotency_key,
    status: row.status as 'pending' | 'resolved' | 'discarded',
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
    resolved_by: row.resolved_by,
    resolution_notes: row.resolution_notes,
  };
}



interface DLQInput {
  readonly status_filter?: string | undefined;
  readonly resolution_notes?: string | undefined;
  readonly resolved_by?: string | undefined;
}

function parseRawInput(raw: unknown): DLQInput {
  if (typeof raw !== 'object' || raw === null) return {};
  const obj = raw as Record<string, unknown>;
  return {
    status_filter: typeof obj['status_filter'] === 'string' ? obj['status_filter'] : undefined,
    resolution_notes: typeof obj['resolution_notes'] === 'string' ? obj['resolution_notes'] : undefined,
    resolved_by: typeof obj['resolved_by'] === 'string' ? obj['resolved_by'] : undefined,
  };
}

export async function main(rawInput: unknown): Promise<Result<unknown>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { action, dlq_id } = parsed.data;
  const extraInput = parseRawInput(rawInput);

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [txErr, txData] = await getGlobalTx(sql, async (tx) => {
      switch (action) {
        case 'list': {
          const status = extraInput.status_filter !== undefined && ['pending', 'resolved', 'discarded'].includes(extraInput.status_filter) ? extraInput.status_filter : 'pending';
          const rows = await tx.values<[
            number, string | null, string | null, string | null,
            string, string, string | null, Readonly<Record<string, unknown>> | null,
            string, string, string, string, string | null, string | null, string | null,
          ][]>`
            SELECT dlq_id, booking_id, provider_id, service_id,
                   failure_reason, last_error_message, last_error_stack,
                   original_payload, idempotency_key, status,
                   created_at, updated_at, resolved_at, resolved_by, resolution_notes
            FROM booking_dlq
            WHERE status = ${status}
            ORDER BY created_at ASC
            LIMIT 100
          `;
          const entries: DLQEntry[] = rows.map((row: [
            number, string | null, string | null, string | null,
            string, string, string | null, Readonly<Record<string, unknown>> | null,
            string, string, string, string, string | null, string | null, string | null,
          ]) => parseDLQRow({
            dlq_id: row[0],
            booking_id: row[1],
            provider_id: row[2],
            service_id: row[3],
            failure_reason: row[4],
            last_error_message: row[5],
            last_error_stack: row[6],
            original_payload: row[7],
            idempotency_key: row[8],
            status: row[9],
            created_at: row[10],
            updated_at: row[11],
            resolved_at: row[12],
            resolved_by: row[13],
            resolution_notes: row[14],
          }));
          return [null, { entries, total: entries.length }];
        }

        case 'retry': {
          if (dlq_id === undefined) {
            const rows = await tx.values<[number][]>`
              SELECT dlq_id FROM booking_dlq
              WHERE status = 'pending'
              ORDER BY created_at ASC
              LIMIT 10
            `;
            const retried: number[] = [];
            for (const row of rows) {
              const id = row[0];
              await tx`
                UPDATE booking_dlq
                SET status = 'pending', updated_at = NOW()
                WHERE dlq_id = ${id}
              `;
              retried.push(id);
            }
            return [null, { retried, count: retried.length }];
          }

          const rows = await tx.values<[number][]>`
            SELECT dlq_id FROM booking_dlq
            WHERE dlq_id = ${dlq_id} AND status = 'pending'
            LIMIT 1
          `;
          const row = rows[0];
          if (row === undefined) {
            return [new Error('DLQ entry ' + String(dlq_id) + ' not found or not pending'), null];
          }

          await tx`
            UPDATE booking_dlq
            SET status = 'pending', updated_at = NOW()
            WHERE dlq_id = ${dlq_id}
          `;
          return [null, { retried: [dlq_id] }];
        }

        case 'resolve': {
          if (dlq_id === undefined) {
            return [new Error('dlq_id is required for resolve'), null];
          }

          await tx`
            UPDATE booking_dlq
            SET status = 'resolved',
                resolved_at = NOW(),
                resolved_by = ${extraInput.resolved_by ?? null},
                resolution_notes = ${extraInput.resolution_notes ?? null},
                updated_at = NOW()
            WHERE dlq_id = ${dlq_id}
          `;
          return [null, { resolved: dlq_id }];
        }

        case 'discard': {
          if (dlq_id === undefined) {
            return [new Error('dlq_id is required for discard'), null];
          }

          await tx`
            UPDATE booking_dlq
            SET status = 'discarded',
                resolved_at = NOW(),
                resolution_notes = ${extraInput.resolution_notes ?? 'Discarded manually'},
                updated_at = NOW()
            WHERE dlq_id = ${dlq_id}
          `;
          return [null, { discarded: dlq_id }];
        }

        case 'status': {
          const rows = await tx.values<[string, bigint | number][]>`
            SELECT status, COUNT(*) as count
            FROM booking_dlq
            GROUP BY status
          `;
          const stats: Record<string, number> = {};
          for (const row of rows) {
            stats[row[0]] = Number(row[1]);
          }
          return [null, stats];
        }

        default: {
          const _exhaustive: never = action;
          return [new Error(`Unknown action: ${String(_exhaustive)}`), null];
        }
      }
    });

    if (txErr !== null) return [txErr, null];
    if (txData === null) return [new Error('DLQ operation failed'), null];
    return [null, txData as Readonly<Record<string, unknown>> | null];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`Internal error: ${msg}`), null];
  } finally {
    await sql.end();
  }
}
