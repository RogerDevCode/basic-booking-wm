// ============================================================================
// PROVIDER AGENDA — View provider daily/weekly schedule with bookings
// ============================================================================
// Returns a provider's agenda for a given date range, showing:
// - Scheduled hours from provider_schedules
// - Existing bookings with client info
// - Schedule overrides (blocked/modified)
// - Available vs booked slots
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  provider_id: z.uuid(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  include_client_details: z.boolean().default(false),
});

interface ProviderRow {
  readonly provider_id: string;
  readonly name: string;
  readonly timezone: string;
}

interface ScheduleRow {
  readonly start_time: string;
  readonly end_time: string;
  readonly is_active: boolean;
}

interface OverrideRow {
  readonly is_blocked: boolean;
  readonly reason: string | null;
}

interface BookingWithClient {
  readonly booking_id: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly status: string;
  readonly client_name: string;
  readonly client_email: string | null;
  readonly service_name: string;
}

interface BookingWithoutClient {
  readonly booking_id: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly status: string;
  readonly service_name: string;
}

type BookingEntry = BookingWithClient | BookingWithoutClient;

interface AgendaDay {
  readonly date: string;
  readonly day_of_week: number;
  readonly schedule_start: string | null;
  readonly schedule_end: string | null;
  readonly is_blocked: boolean;
  readonly block_reason: string | null;
  readonly bookings: BookingEntry[];
  readonly total_bookings: number;
}

interface AgendaResult {
  readonly provider_id: string;
  readonly provider_name: string;
  readonly days: AgendaDay[];
}

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: AgendaResult | null;
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
    const providerRows = await sql<ProviderRow[]>`
      SELECT provider_id, name, timezone FROM providers
      WHERE provider_id = ${input.provider_id}::uuid AND is_active = true LIMIT 1
    `;
    const provider = providerRows[0];
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
      const scheduleRows = await sql<ScheduleRow[]>`
        SELECT start_time, end_time, is_active FROM provider_schedules
        WHERE provider_id = ${input.provider_id}::uuid AND day_of_week = ${dayOfWeek} AND is_active = true
        LIMIT 1
      `;
      const scheduleRow = scheduleRows[0];
      const scheduleStart = scheduleRow !== undefined ? scheduleRow.start_time : null;
      const scheduleEnd = scheduleRow !== undefined ? scheduleRow.end_time : null;

      // Check for overrides
      const overrideRows = await sql<OverrideRow[]>`
        SELECT is_blocked, reason FROM schedule_overrides
        WHERE provider_id = ${input.provider_id}::uuid AND override_date = ${dateStr}::date LIMIT 1
      `;
      const overrideRow = overrideRows[0];
      const isBlocked = overrideRow !== undefined ? overrideRow.is_blocked : false;
      const blockReason = overrideRow !== undefined ? overrideRow.reason : null;

      // Get bookings for this day
      let bookings: BookingEntry[];
      if (input.include_client_details) {
        bookings = await sql<BookingWithClient[]>`
          SELECT b.booking_id, b.start_time, b.end_time, b.status,
                 p.name as client_name, p.email as client_email,
                 s.name as service_name
          FROM bookings b
          JOIN clients p ON p.client_id = b.client_id
          JOIN services s ON s.service_id = b.service_id
          WHERE b.provider_id = ${input.provider_id}::uuid
            AND b.start_time >= ${dateStr}::date
            AND b.start_time < (${dateStr}::date + INTERVAL '1 day')
            AND b.status NOT IN ('cancelled', 'no_show')
          ORDER BY b.start_time ASC
        `;
      } else {
        bookings = await sql<BookingWithoutClient[]>`
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
        provider_id: provider.provider_id,
        provider_name: provider.name,
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
