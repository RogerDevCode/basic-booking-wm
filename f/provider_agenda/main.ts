// ============================================================================
// PROVIDER AGENDA — View provider daily/weekly schedule with bookings
// ============================================================================
// Returns a provider's agenda for a given date range, showing:
// - Scheduled hours from provider_schedules
// - Existing bookings with patient info
// - Schedule overrides (blocked/modified)
// - Available vs booked slots
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  provider_id: z.uuid(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  include_patient_details: z.boolean().default(false),
});

interface AgendaDay {
  readonly date: string;
  readonly day_of_week: number;
  readonly schedule_start: string | null;
  readonly schedule_end: string | null;
  readonly is_blocked: boolean;
  readonly block_reason: string | null;
  readonly bookings: Record<string, unknown>[];
  readonly total_bookings: number;
}

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: { provider_id: string; provider_name: string; days: AgendaDay[] } | null;
  error_message: string | null;
}> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, data: null, error_message: 'Validation error: ' + parsed.error.message };
  }

  const input = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return { success: false, data: null, error_message: 'CONFIGURATION_ERROR: DATABASE_URL is required' };
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    // 1. Verify provider exists
    const providerRows = await sql`
      SELECT provider_id, name, timezone FROM providers
      WHERE provider_id = ${input.provider_id}::uuid AND is_active = true LIMIT 1
    `;
    const provider: Record<string, unknown> | undefined = providerRows[0] as Record<string, unknown> | undefined;
    if (provider === undefined) {
      return { success: false, data: null, error_message: 'Provider not found or inactive' };
    }

    // 2. Generate date range
    const from = new Date(input.date_from + 'T00:00:00');
    const to = new Date(input.date_to + 'T23:59:59');
    const days: AgendaDay[] = [];

    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      if (dateStr === undefined) continue;
      const dayOfWeek = d.getUTCDay();

      // Get schedule for this day
      const scheduleRows = await sql`
        SELECT start_time, end_time, is_active FROM provider_schedules
        WHERE provider_id = ${input.provider_id}::uuid AND day_of_week = ${dayOfWeek} AND is_active = true
        LIMIT 1
      `;
      const scheduleRow: Record<string, unknown> | undefined = scheduleRows[0] as Record<string, unknown> | undefined;
      const scheduleStart = scheduleRow !== undefined ? String(scheduleRow['start_time']) : null;
      const scheduleEnd = scheduleRow !== undefined ? String(scheduleRow['end_time']) : null;

      // Check for overrides
      const overrideRows = await sql`
        SELECT is_blocked, reason FROM schedule_overrides
        WHERE provider_id = ${input.provider_id}::uuid AND override_date = ${dateStr}::date LIMIT 1
      `;
      const overrideRow: Record<string, unknown> | undefined = overrideRows[0] as Record<string, unknown> | undefined;
      const isBlocked = overrideRow !== undefined ? Boolean(overrideRow['is_blocked']) : false;
      const blockReason = overrideRow !== undefined && typeof overrideRow['reason'] === 'string' ? overrideRow['reason'] : null;

      // Get bookings for this day
      let bookingQuery;
      if (input.include_patient_details) {
        bookingQuery = await sql`
          SELECT b.booking_id, b.start_time, b.end_time, b.status,
                 p.name as patient_name, p.email as patient_email,
                 s.name as service_name
          FROM bookings b
          JOIN patients p ON p.patient_id = b.patient_id
          JOIN services s ON s.service_id = b.service_id
          WHERE b.provider_id = ${input.provider_id}::uuid
            AND b.start_time >= ${dateStr}::date
            AND b.start_time < (${dateStr}::date + INTERVAL '1 day')
            AND b.status NOT IN ('cancelled', 'no_show')
          ORDER BY b.start_time ASC
        `;
      } else {
        bookingQuery = await sql`
          SELECT b.booking_id, b.start_time, b.end_time, b.status, s.name as service_name
          FROM bookings b
          JOIN services s ON s.service_id = b.service_id
          WHERE b.provider_id = ${input.provider_id}::uuid
            AND b.start_time >= ${dateStr}::date
            AND b.start_time < (${dateStr}::date + INTERVAL '1 day')
            AND b.status NOT IN ('cancelled', 'no_show')
          ORDER BY b.start_time ASC
        `;
      }
      const bookings = bookingQuery as Record<string, unknown>[];

      days.push({
        date: dateStr,
        day_of_week: dayOfWeek,
        schedule_start: scheduleStart,
        schedule_end: scheduleEnd,
        is_blocked: isBlocked,
        block_reason: blockReason,
        bookings: bookings,
        total_bookings: bookings.length,
      });
    }

    return {
      success: true,
      data: {
        provider_id: String(provider['provider_id']),
        provider_name: String(provider['name']),
        days: days,
      },
      error_message: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: 'Internal error: ' + message };
  } finally {
    await sql.end();
  }
}
