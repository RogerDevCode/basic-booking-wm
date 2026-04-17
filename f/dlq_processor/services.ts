import type postgres from 'postgres';
import type { Result } from '../internal/result';
import { DLQRowSchema } from './types';
import type { DLQEntry, TxClient } from './types';

/**
 * Executes DB logic within a global transaction.
 * Uses reserve() to pin the connection for the duration of the transaction.
 */
export async function withGlobalTx<T>(
  client: postgres.Sql,
  operation: (tx: TxClient) => Promise<Result<T>>,
): Promise<Result<T>> {
  const reserved = await client.reserve();
  try {
    await reserved`BEGIN`;
    const [err, data] = await operation(reserved);

    if (err !== null) {
      await reserved`ROLLBACK`;
      return [err, null];
    }

    await reserved`COMMIT`;
    return [null, data];
  } catch (error: unknown) {
    await reserved`ROLLBACK`.catch(() => { /* silent */ });
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`global_transaction_failed: ${msg}`), null];
  } finally {
    reserved.release();
  }
}

/**
 * Lists entries filtered by status.
 */
export async function listDLQ(tx: TxClient, filter?: string): Promise<Result<unknown>> {
  const status = filter && ['pending', 'resolved', 'discarded'].includes(filter) ? filter : 'pending';

  try {
    const rows = await tx<Record<string, unknown>[]>`
      SELECT 
        dlq_id, booking_id, provider_id, service_id, 
        failure_reason, last_error_message, last_error_stack, 
        original_payload, idempotency_key, status, 
        created_at, updated_at, resolved_at, resolved_by, resolution_notes
      FROM booking_dlq
      WHERE status = ${status}
      ORDER BY created_at ASC
      LIMIT 100
    `;

    const entries: DLQEntry[] = [];
    for (const r of rows) {
      const parsed = DLQRowSchema.safeParse(r);
      if (parsed.success) {
        entries.push(parsed.data);
      }
    }

    return [null, { entries, total: entries.length }];
  } catch (error: unknown) {
    return [new Error(`list_failed: ${String(error)}`), null];
  }
}

/**
 * Marks entries as pending for retry.
 */
export async function retryDLQ(tx: TxClient, dlq_id?: number): Promise<Result<unknown>> {
  try {
    if (dlq_id === undefined) {
      // Batch retry logic
      const rows = await tx<{ dlq_id: number }[]>`
        SELECT dlq_id FROM booking_dlq
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 10
        FOR UPDATE SKIP LOCKED
      `;

      const retried: number[] = [];
      for (const row of rows) {
        await tx`
          UPDATE booking_dlq
          SET status = 'pending', updated_at = NOW()
          WHERE dlq_id = ${row.dlq_id}
        `;
        retried.push(row.dlq_id);
      }
      return [null, { retried, count: retried.length }];
    }

    // Targeted retry logic
    const rows = await tx<{ dlq_id: number }[]>`
      SELECT dlq_id FROM booking_dlq
      WHERE dlq_id = ${dlq_id} AND status = 'pending'
      FOR UPDATE
    `;

    if (rows.length === 0) {
      return [new Error(`dlq_entry_not_found_or_not_pending: ID ${String(dlq_id)}`), null];
    }

    await tx`
      UPDATE booking_dlq
      SET status = 'pending', updated_at = NOW()
      WHERE dlq_id = ${dlq_id}
    `;
    return [null, { retried: [dlq_id] }];
  } catch (error: unknown) {
    return [new Error(`retry_failed: ${String(error)}`), null];
  }
}

/**
 * Marks an entry as resolved.
 */
export async function resolveDLQ(
  tx: TxClient,
  dlq_id: number,
  resolved_by?: string,
  notes?: string,
): Promise<Result<unknown>> {
  try {
    const result = await tx`
      UPDATE booking_dlq
      SET status = 'resolved',
          resolved_at = NOW(),
          resolved_by = ${resolved_by ?? null},
          resolution_notes = ${notes ?? null},
          updated_at = NOW()
      WHERE dlq_id = ${dlq_id}
    `;

    if (result.count === 0) {
      return [new Error(`dlq_entry_not_found: ID ${String(dlq_id)}`), null];
    }

    return [null, { resolved: dlq_id }];
  } catch (error: unknown) {
    return [new Error(`resolve_failed: ${String(error)}`), null];
  }
}

/**
 * Marks an entry as discarded.
 */
export async function discardDLQ(
  tx: TxClient,
  dlq_id: number,
  notes?: string,
): Promise<Result<unknown>> {
  try {
    const result = await tx`
      UPDATE booking_dlq
      SET status = 'discarded',
          resolved_at = NOW(),
          resolution_notes = ${notes ?? 'Discarded manually'},
          updated_at = NOW()
      WHERE dlq_id = ${dlq_id}
    `;

    if (result.count === 0) {
      return [new Error(`dlq_entry_not_found: ID ${String(dlq_id)}`), null];
    }

    return [null, { discarded: dlq_id }];
  } catch (error: unknown) {
    return [new Error(`discard_failed: ${String(error)}`), null];
  }
}

/**
 * Returns aggregation statistics by status.
 */
export async function getDLQStatus(tx: TxClient): Promise<Result<unknown>> {
  try {
    const rows = await tx<{ status: string; count: string }[]>`
      SELECT status, COUNT(*) as count
      FROM booking_dlq
      GROUP BY status
    `;

    const stats: Record<string, number> = {};
    for (const row of rows) {
      stats[row.status] = Number(row.count);
    }
    return [null, stats];
  } catch (error: unknown) {
    return [new Error(`status_failed: ${String(error)}`), null];
  }
}
