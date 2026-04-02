// ============================================================================
// NO-SHOW TRIGGER — Mark bookings as no_show after appointment time passes
// ============================================================================
// Cron job: runs every 30 minutes.
// Finds confirmed bookings where end_time has passed and status is still confirmed.
// Marks them as no_show, updates audit trail, marks GCal for cleanup.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  dry_run: z.boolean().optional().default(false),
  lookback_minutes: z.number().int().min(1).max(1440).default(60),
});

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: { processed: number; marked: number; skipped: number; booking_ids: string[] } | null;
  error_message: string | null;
}> {
  const parsed = InputSchema.safeParse(rawInput);
  if (parsed.success === false) {
    return { success: false, data: null, error_message: 'Validation error: ' + parsed.error.message };
  }

  const input = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return { success: false, data: null, error_message: 'CONFIGURATION_ERROR: DATABASE_URL is required' };
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    // Find confirmed bookings that ended more than lookback_minutes ago
    const rows = await sql`
      SELECT booking_id, provider_id, patient_id, status, start_time, end_time
      FROM bookings
      WHERE status = 'confirmed'
        AND end_time < (NOW() - (${input.lookback_minutes} || ' minutes')::interval)
      ORDER BY end_time ASC
      LIMIT 100
    `;

    const bookingIds: string[] = [];
    let marked = 0;
    let skipped = 0;

    for (const r of (rows ?? [])) {
      const row = r as Record<string, unknown>;
      const bookingId = String(row['booking_id']);

      if (input.dry_run) {
        skipped++;
        bookingIds.push(bookingId);
        continue;
      }

      await sql`
        UPDATE bookings
        SET status = 'no_show', updated_at = NOW()
        WHERE booking_id = ${bookingId}::uuid
      `;

      await sql`
        INSERT INTO booking_audit (booking_id, from_status, to_status, changed_by, actor_id, reason)
        VALUES (${bookingId}::uuid, 'confirmed', 'no_show', 'system', null, 'Auto-marked as no-show by cron job')
      `;

      marked++;
      bookingIds.push(bookingId);
    }

    return {
      success: true,
      data: { processed: rows !== null ? rows.length : 0, marked: marked, skipped: skipped, booking_ids: bookingIds },
      error_message: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: 'Internal error: ' + message };
  } finally {
    await sql.end();
  }
}
