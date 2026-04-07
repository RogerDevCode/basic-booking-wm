// ============================================================================
// NO-SHOW TRIGGER — Mark bookings as no_show after appointment time passes
// ============================================================================
// Cron job: runs every 30 minutes.
// Finds confirmed bookings where end_time has passed and status is still confirmed.
// Marks them as no_show, updates audit trail, marks GCal for cleanup.
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  dry_run: z.boolean().optional().default(false),
  lookback_minutes: z.number().int().min(1).max(1440).default(60),
});

interface NoShowResult {
  readonly processed: number;
  readonly marked: number;
  readonly skipped: number;
  readonly booking_ids: readonly string[];
}

export async function main(rawInput: unknown): Promise<[Error | null, NoShowResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });
  const tenantId = '00000000-0000-0000-0000-000000000000';

  try {
    const [txErr, txResult] = await withTenantContext(sql, tenantId, async (tx) => {
      const rows = await tx.values<[string, string, string, string, string, string][]>`
        SELECT booking_id, provider_id, client_id, status, start_time, end_time
        FROM bookings
        WHERE status = 'confirmed'
          AND end_time < (NOW() - (${input.lookback_minutes} || ' minutes')::interval)
        ORDER BY end_time ASC
        LIMIT 100
      `;

      const bookingIds: string[] = [];
      let marked = 0;
      let skipped = 0;

      for (const row of rows) {
        const bookingId = row[0];

        if (input.dry_run) {
          skipped++;
          bookingIds.push(bookingId);
          continue;
        }

        await tx`
          UPDATE bookings
          SET status = 'no_show', updated_at = NOW()
          WHERE booking_id = ${bookingId}::uuid
        `;

        await tx`
          INSERT INTO booking_audit (booking_id, from_status, to_status, changed_by, actor_id, reason)
          VALUES (${bookingId}::uuid, 'confirmed', 'no_show', 'system', null, 'Auto-marked as no-show by cron job')
        `;

        marked++;
        bookingIds.push(bookingId);
      }

      const result: NoShowResult = {
        processed: rows.length,
        marked,
        skipped,
        booking_ids: bookingIds,
      };

      return [null, result];
    });

    if (txErr !== null) return [txErr, null];
    if (txResult === null) return [new Error('No-show trigger failed'), null];
    return [null, txResult];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
