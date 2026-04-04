// ============================================================================
// DLQ PROCESSOR — Dead Letter Queue handler for failed bookings
// ============================================================================
// Reads booking_dlq table, retries failed bookings, and manages resolution.
// States: pending -> resolved | discarded
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

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

interface DLQStatusRow {
  readonly status: string;
  readonly count: bigint | number;
}

interface DLQIdRow {
  readonly dlq_id: number;
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

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: Readonly<Record<string, unknown>> | null;
  error_message: string | null;
}> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, data: null, error_message: "Validation error: " + parsed.error.message };
  }

  const { action, dlq_id } = parsed.data;
  const extraInput = parseRawInput(rawInput);

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return { success: false, data: null, error_message: 'CONFIGURATION_ERROR: DATABASE_URL is required' };
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    switch (action) {
      case 'list': {
        const status = extraInput.status_filter !== undefined && ['pending', 'resolved', 'discarded'].includes(extraInput.status_filter) ? extraInput.status_filter : 'pending';
        const rows = await sql<DLQRow[]>`
          SELECT dlq_id, booking_id, provider_id, service_id,
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
          entries.push(parseDLQRow(r));
        }
        return { success: true, data: { entries, total: entries.length }, error_message: null };
      }

      case 'retry': {
        if (dlq_id === undefined) {
          const rows = await sql<DLQIdRow[]>`
            SELECT dlq_id FROM booking_dlq
            WHERE status = 'pending'
            ORDER BY created_at ASC
            LIMIT 10
          `;
          const retried: number[] = [];
          for (const r of rows) {
            const id = r.dlq_id;
            await sql`
              UPDATE booking_dlq
              SET status = 'pending', updated_at = NOW()
              WHERE dlq_id = ${id}
            `;
            retried.push(id);
          }
          return { success: true, data: { retried, count: retried.length }, error_message: null };
        }

        const rows = await sql<DLQIdRow[]>`
          SELECT dlq_id FROM booking_dlq
          WHERE dlq_id = ${dlq_id} AND status = 'pending'
          LIMIT 1
        `;
        const row = rows[0];
        if (row === undefined) {
          return { success: false, data: null, error_message: "DLQ entry " + String(dlq_id) + " not found or not pending" };
        }

        await sql`
          UPDATE booking_dlq
          SET status = 'pending', updated_at = NOW()
          WHERE dlq_id = ${dlq_id}
        `;
        return { success: true, data: { retried: [dlq_id] }, error_message: null };
      }

      case 'resolve': {
        if (dlq_id === undefined) {
          return { success: false, data: null, error_message: 'dlq_id is required for resolve' };
        }

        await sql`
          UPDATE booking_dlq
          SET status = 'resolved',
              resolved_at = NOW(),
              resolved_by = ${extraInput.resolved_by ?? null},
              resolution_notes = ${extraInput.resolution_notes ?? null},
              updated_at = NOW()
          WHERE dlq_id = ${dlq_id}
        `;
        return { success: true, data: { resolved: dlq_id }, error_message: null };
      }

      case 'discard': {
        if (dlq_id === undefined) {
          return { success: false, data: null, error_message: 'dlq_id is required for discard' };
        }

        await sql`
          UPDATE booking_dlq
          SET status = 'discarded',
              resolved_at = NOW(),
              resolution_notes = ${extraInput.resolution_notes ?? 'Discarded manually'},
              updated_at = NOW()
          WHERE dlq_id = ${dlq_id}
        `;
        return { success: true, data: { discarded: dlq_id }, error_message: null };
      }

      case 'status': {
        const rows = await sql<DLQStatusRow[]>`
          SELECT status, COUNT(*) as count
          FROM booking_dlq
          GROUP BY status
        `;
        const stats: Record<string, number> = {};
        for (const r of rows) {
          stats[r.status] = Number(r.count);
        }
        return { success: true, data: stats, error_message: null };
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: "Internal error: " + message };
  } finally {
    await sql.end();
  }
}
