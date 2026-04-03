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
  readonly original_payload: Record<string, unknown>;
  readonly idempotency_key: string;
  readonly status: 'pending' | 'resolved' | 'discarded';
  readonly created_at: string;
  readonly updated_at: string;
  readonly resolved_at: string | null;
  readonly resolved_by: string | null;
  readonly resolution_notes: string | null;
}

function parseDLQRow(row: Record<string, unknown>): DLQEntry {
  return {
    dlq_id: Number(row['dlq_id']),
    booking_id: typeof row['booking_id'] === 'string' ? row['booking_id'] : null,
    provider_id: typeof row['provider_id'] === 'string' ? row['provider_id'] : null,
    service_id: typeof row['service_id'] === 'string' ? row['service_id'] : null,
    failure_reason: String(row['failure_reason']),
    last_error_message: String(row['last_error_message']),
    last_error_stack: typeof row['last_error_stack'] === 'string' ? row['last_error_stack'] : null,
    original_payload: typeof row['original_payload'] === 'object' && row['original_payload'] !== null
      ? row['original_payload'] as Record<string, unknown>
      : {},
    idempotency_key: String(row['idempotency_key']),
    status: String(row['status']) as 'pending' | 'resolved' | 'discarded',
    created_at: String(row['created_at']),
    updated_at: String(row['updated_at']),
    resolved_at: typeof row['resolved_at'] === 'string' ? row['resolved_at'] : null,
    resolved_by: typeof row['resolved_by'] === 'string' ? row['resolved_by'] : null,
    resolution_notes: typeof row['resolution_notes'] === 'string' ? row['resolution_notes'] : null,
  };
}

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: Record<string, unknown> | null;
  error_message: string | null;
}> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, data: null, error_message: "Validation error: " + parsed.error.message };
  }

  const { action, dlq_id } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return { success: false, data: null, error_message: 'CONFIGURATION_ERROR: DATABASE_URL is required' };
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    switch (action) {
      case 'list': {
        const statusFilter = (rawInput as Record<string, unknown>)['status_filter'] as string | undefined;
        const status = statusFilter !== undefined && ['pending', 'resolved', 'discarded'].includes(statusFilter) ? statusFilter : 'pending';
        const rows = await sql`
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
          entries.push(parseDLQRow(r as Record<string, unknown>));
        }
        return { success: true, data: { entries, total: entries.length }, error_message: null };
      }

      case 'retry': {
        if (dlq_id === undefined) {
          const rows = await sql`
            SELECT dlq_id FROM booking_dlq
            WHERE status = 'pending'
            ORDER BY created_at ASC
            LIMIT 10
          `;
          const retried: number[] = [];
          for (const r of rows) {
            const entry = r as Record<string, unknown>;
            const id = Number(entry['dlq_id']);
            await sql`
              UPDATE booking_dlq
              SET status = 'pending', updated_at = NOW()
              WHERE dlq_id = ${id}
            `;
            retried.push(id);
          }
          return { success: true, data: { retried, count: retried.length }, error_message: null };
        }

        const rows = await sql`
          SELECT dlq_id FROM booking_dlq
          WHERE dlq_id = ${dlq_id} AND status = 'pending'
          LIMIT 1
        `;
        const row: Record<string, unknown> | undefined = rows[0] as Record<string, unknown> | undefined;
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
        const notes = (rawInput as Record<string, unknown>)['resolution_notes'] as string | undefined;
        const resolvedBy = (rawInput as Record<string, unknown>)['resolved_by'] as string | undefined;

        await sql`
          UPDATE booking_dlq
          SET status = 'resolved',
              resolved_at = NOW(),
              resolved_by = ${resolvedBy ?? null},
              resolution_notes = ${notes ?? null},
              updated_at = NOW()
          WHERE dlq_id = ${dlq_id}
        `;
        return { success: true, data: { resolved: dlq_id }, error_message: null };
      }

      case 'discard': {
        if (dlq_id === undefined) {
          return { success: false, data: null, error_message: 'dlq_id is required for discard' };
        }
        const notes = (rawInput as Record<string, unknown>)['resolution_notes'] as string | undefined;

        await sql`
          UPDATE booking_dlq
          SET status = 'discarded',
              resolved_at = NOW(),
              resolution_notes = ${notes ?? 'Discarded manually'},
              updated_at = NOW()
          WHERE dlq_id = ${dlq_id}
        `;
        return { success: true, data: { discarded: dlq_id }, error_message: null };
      }

      case 'status': {
        const rows = await sql`
          SELECT status, COUNT(*) as count
          FROM booking_dlq
          GROUP BY status
        `;
        const stats: Record<string, number> = {};
        for (const r of rows) {
          const row = r as Record<string, unknown>;
          stats[String(row['status'])] = Number(row['count']);
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
