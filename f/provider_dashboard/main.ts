// ============================================================================
// PROVIDER DASHBOARD API — Backend for provider dashboard frontend
// ============================================================================
// Actions: get_week, get_day_slots, block_date, unblock_date, save_schedule
// Returns real data from PostgreSQL via Windmill
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { getAvailability, validateOverride } from '../internal/scheduling-engine';

const InputSchema = z.object({
  action: z.enum(['get_week', 'get_day_slots', 'block_date', 'unblock_date', 'save_schedule', 'get_provider', 'list_services', 'list_overrides', 'list_schedules']),
  provider_id: z.uuid().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  service_id: z.uuid().optional(),
  override_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  override_date_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reason: z.string().max(200).optional(),
  schedules: z.array(z.object({
    day_of_week: z.number().int().min(0).max(6),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
    is_active: z.boolean(),
  })).optional(),
});

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: Record<string, unknown> | null;
  error_message: string | null;
}> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };
  }

  const input = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl == null || dbUrl === '') {
    return { success: false, data: null, error_message: 'DATABASE_URL not configured' };
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    switch (input.action) {
      case 'get_provider': {
        const pid = input.provider_id;
        if (pid == null) {
          const rows = await sql`SELECT provider_id, name, email, specialty, timezone FROM providers WHERE is_active = true LIMIT 1`;
          const row = rows[0];
          if (row == null) return { success: false, data: null, error_message: 'No active providers found' };
          return { success: true, data: { provider_id: String(row['provider_id']), name: String(row['name']), email: String(row['email']), specialty: String(row['specialty']), timezone: String(row['timezone']) }, error_message: null };
        }
        const rows = await sql`SELECT provider_id, name, email, specialty, timezone FROM providers WHERE provider_id = ${pid}::uuid LIMIT 1`;
        const row = rows[0];
        if (row == null) return { success: false, data: null, error_message: 'Provider not found' };
        return { success: true, data: { provider_id: String(row['provider_id']), name: String(row['name']), email: String(row['email']), specialty: String(row['specialty']), timezone: String(row['timezone']) }, error_message: null };
      }

      case 'get_week': {
        if (input.provider_id == null || input.date_from == null || input.date_to == null || input.service_id == null) {
          return { success: false, data: null, error_message: 'provider_id, date_from, date_to, service_id required' };
        }

        const days: Record<string, unknown>[] = [];
        const current = new Date(input.date_from + 'T00:00:00Z');
        const end = new Date(input.date_to + 'T23:59:59Z');

        while (current <= end) {
          const dateStr = current.toISOString().split('T')[0];
          if (dateStr != null) {
            const [err, avail] = await getAvailability(sql, {
              provider_id: input.provider_id,
              date: dateStr,
              service_id: input.service_id,
            });

            if (err != null) {
              days.push({ date: dateStr, error: err.message });
            } else if (avail != null) {
              // Get bookings with client info for this day
              const bookings = await sql`
                SELECT b.booking_id, b.start_time, b.end_time, b.status,
                       p.name as client_name, s.name as service_name
                FROM bookings b
                JOIN clients p ON p.client_id = b.client_id
                JOIN services s ON s.service_id = b.service_id
                WHERE b.provider_id = ${input.provider_id}::uuid
                  AND b.start_time >= ${dateStr}::date
                  AND b.start_time < (${dateStr}::date + INTERVAL '1 day')
                  AND b.status NOT IN ('cancelled', 'no_show', 'rescheduled')
                ORDER BY b.start_time ASC
              `;

              days.push({
                date: dateStr,
                day_of_week: current.getUTCDay(),
                schedule_start: avail.is_blocked ? null : (avail.slots.length > 0 ? avail.slots[0]?.start?.slice(11, 16) ?? null : null),
                schedule_end: avail.is_blocked ? null : (avail.slots.length > 0 ? avail.slots[avail.slots.length - 1]?.end?.slice(11, 16) ?? null : null),
                is_blocked: avail.is_blocked,
                block_reason: avail.block_reason,
                bookings: bookings.map((b: Record<string, unknown>) => ({
                  booking_id: String(b['booking_id']),
                  start_time: String(b['start_time']),
                  end_time: String(b['end_time']),
                  status: String(b['status']),
                  client_name: String(b['client_name']),
                  service_name: String(b['service_name']),
                })),
                total_bookings: bookings.length,
                total_available: avail.total_available,
              });
            }
          }
          current.setDate(current.getDate() + 1);
        }

        return { success: true, data: { days }, error_message: null };
      }

      case 'get_day_slots': {
        if (input.provider_id == null || input.date == null || input.service_id == null) {
          return { success: false, data: null, error_message: 'provider_id, date, service_id required' };
        }

        const [err, avail] = await getAvailability(sql, {
          provider_id: input.provider_id,
          date: input.date,
          service_id: input.service_id,
        });

        if (err != null) return { success: false, data: null, error_message: err.message };
        if (avail == null) return { success: false, data: null, error_message: 'No availability data' };

        // Get bookings with client info
        const bookings = await sql`
          SELECT b.booking_id, b.start_time, b.end_time, b.status,
                 p.name as client_name, p.email as client_email, s.name as service_name
          FROM bookings b
          JOIN clients p ON p.client_id = b.client_id
          JOIN services s ON s.service_id = b.service_id
          WHERE b.provider_id = ${input.provider_id}::uuid
            AND b.start_time >= ${input.date}::date
            AND b.start_time < (${input.date}::date + INTERVAL '1 day')
            AND b.status NOT IN ('cancelled', 'no_show', 'rescheduled')
          ORDER BY b.start_time ASC
        `;

        return {
          success: true,
          data: {
            date: avail.date,
            is_blocked: avail.is_blocked,
            block_reason: avail.block_reason,
            total_available: avail.total_available,
            total_booked: avail.total_booked,
            slots: avail.slots,
            bookings: bookings.map((b: Record<string, unknown>) => ({
              booking_id: String(b['booking_id']),
              start_time: String(b['start_time']),
              end_time: String(b['end_time']),
              status: String(b['status']),
              client_name: String(b['client_name']),
              client_email: b['client_email'] != null ? String(b['client_email']) : null,
              service_name: String(b['service_name']),
            })),
          },
          error_message: null,
        };
      }

      case 'block_date': {
        if (input.provider_id == null || input.override_date == null) {
          return { success: false, data: null, error_message: 'provider_id and override_date required' };
        }

        const dateEnd = input.override_date_end ?? input.override_date;

        // Validate: check for existing bookings
        const [valErr, validation] = await validateOverride(sql, input.provider_id, input.override_date, dateEnd);
        if (valErr != null) return { success: false, data: null, error_message: valErr.message };

        // Insert override
        await sql`
          INSERT INTO schedule_overrides (provider_id, override_date, override_date_end, is_available, reason)
          VALUES (${input.provider_id}::uuid, ${input.override_date}::date, ${dateEnd}::date, false, ${input.reason ?? 'Bloqueado'})
          ON CONFLICT (provider_id, override_date)
          DO UPDATE SET override_date_end = EXCLUDED.override_date_end, is_available = false, reason = EXCLUDED.reason
        `;

        return {
          success: true,
          data: {
            blocked: true,
            date: input.override_date,
            date_end: dateEnd,
            has_existing_bookings: validation?.hasBookings ?? false,
            booking_count: validation?.bookingCount ?? 0,
            affected_bookings: validation?.affectedBookings ?? [],
          },
          error_message: null,
        };
      }

      case 'unblock_date': {
        if (input.provider_id == null || input.override_date == null) {
          return { success: false, data: null, error_message: 'provider_id and override_date required' };
        }

        await sql`
          DELETE FROM schedule_overrides
          WHERE provider_id = ${input.provider_id}::uuid
            AND override_date = ${input.override_date}::date
            AND is_available = false
        `;

        return { success: true, data: { unblocked: true, date: input.override_date }, error_message: null };
      }

      case 'save_schedule': {
        if (input.provider_id == null || input.schedules == null) {
          return { success: false, data: null, error_message: 'provider_id and schedules required' };
        }

        // Delete existing schedules for this provider
        await sql`DELETE FROM provider_schedules WHERE provider_id = ${input.provider_id}::uuid`;

        // Insert new schedules
        for (const s of input.schedules) {
          if (s.is_active) {
            await sql`
              INSERT INTO provider_schedules (provider_id, day_of_week, start_time, end_time, is_active)
              VALUES (${input.provider_id}::uuid, ${s.day_of_week}, ${s.start_time}::time, ${s.end_time}::time, true)
              ON CONFLICT (provider_id, day_of_week, start_time)
              DO UPDATE SET end_time = EXCLUDED.end_time, is_active = true
            `;
          }
        }

        return { success: true, data: { saved: true, count: input.schedules.filter(s => s.is_active).length }, error_message: null };
      }

      case 'list_services': {
        if (input.provider_id == null) {
          return { success: false, data: null, error_message: 'provider_id required' };
        }
        const rows = await sql`
          SELECT service_id, name, description, duration_minutes, buffer_minutes, price_cents, currency, is_active
          FROM services WHERE provider_id = ${input.provider_id}::uuid ORDER BY name ASC
        `;
        return { success: true, data: { services: rows.map((r: Record<string, unknown>) => ({
          service_id: String(r['service_id']),
          name: String(r['name']),
          description: r['description'] != null ? String(r['description']) : null,
          duration_minutes: Number(r['duration_minutes']),
          buffer_minutes: Number(r['buffer_minutes']),
          price_cents: Number(r['price_cents']),
          currency: String(r['currency']),
          is_active: Boolean(r['is_active']),
        }))}, error_message: null };
      }

      case 'list_overrides': {
        if (input.provider_id == null) {
          return { success: false, data: null, error_message: 'provider_id required' };
        }
        const rows = await sql`
          SELECT override_id, override_date, override_date_end, is_available, reason
          FROM schedule_overrides WHERE provider_id = ${input.provider_id}::uuid
          ORDER BY override_date DESC
        `;
        return { success: true, data: { overrides: rows.map((r: Record<string, unknown>) => ({
          override_id: String(r['override_id']),
          override_date: String(r['override_date']),
          override_date_end: r['override_date_end'] != null ? String(r['override_date_end']) : null,
          is_available: Boolean(r['is_available']),
          reason: r['reason'] != null ? String(r['reason']) : null,
        }))}, error_message: null };
      }

      case 'list_schedules': {
        if (input.provider_id == null) {
          return { success: false, data: null, error_message: 'provider_id required' };
        }
        const rows = await sql`
          SELECT schedule_id, day_of_week, start_time, end_time, is_active
          FROM provider_schedules WHERE provider_id = ${input.provider_id}::uuid
          ORDER BY day_of_week ASC
        `;
        return { success: true, data: { schedules: rows.map((r: Record<string, unknown>) => ({
          schedule_id: String(r['schedule_id']),
          day_of_week: Number(r['day_of_week']),
          start_time: String(r['start_time']),
          end_time: String(r['end_time']),
          is_active: Boolean(r['is_active']),
        }))}, error_message: null };
      }

      default: {
        const _exhaustive: never = input.action;
        return { success: false, data: null, error_message: `Unknown action: ${String(_exhaustive)}` };
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: `Internal error: ${message}` };
  } finally {
    await sql.end();
  }
}
