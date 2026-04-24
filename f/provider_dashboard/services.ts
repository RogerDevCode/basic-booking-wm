import postgres from 'postgres';
import { getAvailability, validateOverride } from '../internal/scheduling-engine/index.ts';
import type { Result } from '../internal/result/index.ts';
import { type Input } from './types.ts';

export async function getProvider(tx: postgres.Sql, input: Input): Promise<Result<unknown>> {
  const pid = input.provider_id;
  if (pid == null) {
    const rows = await tx.values<[string, string, string, string, string][]>`SELECT provider_id, name, email, specialty, timezone FROM providers WHERE is_active = true LIMIT 1`;
    const row = rows[0];
    if (row == null) return [new Error('No active providers found'), null];
    return [null, { provider_id: row[0], name: row[1], email: row[2], specialty: row[3], timezone: row[4] }];
  }
  const rows = await tx.values<[string, string, string, string, string][]>`SELECT provider_id, name, email, specialty, timezone FROM providers WHERE provider_id = ${pid}::uuid LIMIT 1`;
  const row = rows[0];
  if (row == null) return [new Error('Provider not found'), null];
  return [null, { provider_id: row[0], name: row[1], email: row[2], specialty: row[3], timezone: row[4] }];
}

export async function getWeek(tx: postgres.Sql, input: Input): Promise<Result<unknown>> {
  if (input.provider_id == null || input.date_from == null || input.date_to == null || input.service_id == null) {
    return [new Error('provider_id, date_from, date_to, service_id required'), null];
  }
  const days: Record<string, unknown>[] = [];
  const current = new Date(input.date_from + 'T00:00:00Z');
  const end = new Date(input.date_to + 'T23:59:59Z');

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    if (dateStr != null) {
      const [err, avail] = await getAvailability(tx, { provider_id: input.provider_id, date: dateStr, service_id: input.service_id });
      if (err != null) {
        days.push({ date: dateStr, error: err.message });
      } else if (avail != null) {
        const bookings = await tx`
          SELECT b.booking_id, b.start_time, b.end_time, b.status, p.name as client_name, s.name as service_name
          FROM bookings b
          JOIN clients p ON p.client_id = b.client_id
          JOIN services s ON s.service_id = b.service_id
          WHERE b.provider_id = ${input.provider_id}::uuid AND b.start_time >= ${dateStr}::date
            AND b.start_time < (${dateStr}::date + INTERVAL '1 day') AND b.status NOT IN ('cancelled', 'no_show', 'rescheduled')
          ORDER BY b.start_time ASC
        `;
        days.push({
          date: dateStr, day_of_week: current.getUTCDay(),
          schedule_start: avail.is_blocked ? null : (avail.slots.length > 0 ? avail.slots[0]?.start?.slice(11, 16) ?? null : null),
          schedule_end: avail.is_blocked ? null : (avail.slots.length > 0 ? avail.slots.at(-1)?.end?.slice(11, 16) ?? null : null),
          is_blocked: avail.is_blocked, block_reason: avail.block_reason,
          bookings: bookings.map((b: Record<string, unknown>) => ({
            booking_id: String(b['booking_id']), start_time: String(b['start_time']), end_time: String(b['end_time']),
            status: String(b['status']), client_name: String(b['client_name']), service_name: String(b['service_name']),
          })),
          total_bookings: bookings.length, total_available: avail.total_available,
        });
      }
    }
    current.setDate(current.getDate() + 1);
  }
  return [null, { days }];
}

export async function getDaySlots(tx: postgres.Sql, input: Input): Promise<Result<unknown>> {
  if (input.provider_id == null || input.date == null || input.service_id == null) {
    return [new Error('provider_id, date, service_id required'), null];
  }
  const [err, avail] = await getAvailability(tx, { provider_id: input.provider_id, date: input.date, service_id: input.service_id });
  if (err != null) return [err, null];
  if (avail == null) return [new Error('No availability data'), null];

  const bookings = await tx`
    SELECT b.booking_id, b.start_time, b.end_time, b.status, p.name as client_name, p.email as client_email, s.name as service_name
    FROM bookings b
    JOIN clients p ON p.client_id = b.client_id
    JOIN services s ON s.service_id = b.service_id
    WHERE b.provider_id = ${input.provider_id}::uuid AND b.start_time >= ${input.date}::date
      AND b.start_time < (${input.date}::date + INTERVAL '1 day') AND b.status NOT IN ('cancelled', 'no_show', 'rescheduled')
    ORDER BY b.start_time ASC
  `;
  return [null, {
    date: avail.date, is_blocked: avail.is_blocked, block_reason: avail.block_reason,
    total_available: avail.total_available, total_booked: avail.total_booked, slots: avail.slots,
    bookings: bookings.map((b: Record<string, unknown>) => ({
      booking_id: String(b['booking_id']), start_time: String(b['start_time']), end_time: String(b['end_time']), status: String(b['status']),
      client_name: String(b['client_name']), client_email: (typeof b['client_email'] === 'string') ? b['client_email'] : null, service_name: String(b['service_name']),
    })),
  }];
}

export async function blockDate(tx: postgres.Sql, input: Input): Promise<Result<unknown>> {
  if (input.provider_id == null || input.override_date == null) {
    return [new Error('provider_id and override_date required'), null];
  }
  const dateEnd = input.override_date_end ?? input.override_date;
  const [valErr, validation] = await validateOverride(tx, input.provider_id, input.override_date, dateEnd);
  if (valErr != null) return [valErr, null];

  await tx`
    INSERT INTO schedule_overrides (provider_id, override_date, override_date_end, is_available, reason)
    VALUES (${input.provider_id}::uuid, ${input.override_date}::date, ${dateEnd}::date, false, ${input.reason ?? 'Bloqueado'})
    ON CONFLICT (provider_id, override_date)
    DO UPDATE SET override_date_end = EXCLUDED.override_date_end, is_available = false, reason = EXCLUDED.reason
  `;
  return [null, {
    blocked: true, date: input.override_date, date_end: dateEnd,
    has_existing_bookings: validation?.hasBookings ?? false, booking_count: validation?.bookingCount ?? 0, affected_bookings: validation?.affectedBookings ?? [],
  }];
}

export async function unblockDate(tx: postgres.Sql, input: Input): Promise<Result<unknown>> {
  if (input.provider_id == null || input.override_date == null) {
    return [new Error('provider_id and override_date required'), null];
  }
  await tx`DELETE FROM schedule_overrides WHERE provider_id = ${input.provider_id}::uuid AND override_date = ${input.override_date}::date AND is_available = false`;
  return [null, { unblocked: true, date: input.override_date }];
}

export async function saveSchedule(tx: postgres.Sql, input: Input): Promise<Result<unknown>> {
  if (input.provider_id == null || input.schedules == null) {
    return [new Error('provider_id and schedules required'), null];
  }
  await tx`DELETE FROM provider_schedules WHERE provider_id = ${input.provider_id}::uuid`;
  for (const s of input.schedules) {
    if (s.is_active) {
      await tx`
        INSERT INTO provider_schedules (provider_id, day_of_week, start_time, end_time, is_active)
        VALUES (${input.provider_id}::uuid, ${s.day_of_week}, ${s.start_time}::time, ${s.end_time}::time, true)
        ON CONFLICT (provider_id, day_of_week, start_time)
        DO UPDATE SET end_time = EXCLUDED.end_time, is_active = true
      `;
    }
  }
  return [null, { saved: true, count: input.schedules.filter(s => s.is_active).length }];
}

export async function listServices(tx: postgres.Sql, input: Input): Promise<Result<unknown>> {
  if (input.provider_id == null) return [new Error('provider_id required'), null];
  const rows = await tx`SELECT service_id, name, description, duration_minutes, buffer_minutes, price_cents, currency, is_active FROM services WHERE provider_id = ${input.provider_id}::uuid ORDER BY name ASC`;
  return [null, { services: rows.map((r: Record<string, unknown>) => ({
    service_id: String(r['service_id']), name: String(r['name']), description: (typeof r['description'] === 'string') ? r['description'] : null,
    duration_minutes: Number(r['duration_minutes']), buffer_minutes: Number(r['buffer_minutes']), price_cents: Number(r['price_cents']),
    currency: String(r['currency']), is_active: Boolean(r['is_active']),
  }))}];
}

export async function listOverrides(tx: postgres.Sql, input: Input): Promise<Result<unknown>> {
  if (input.provider_id == null) return [new Error('provider_id required'), null];
  const rows = await tx`SELECT override_id, override_date, override_date_end, is_available, reason FROM schedule_overrides WHERE provider_id = ${input.provider_id}::uuid ORDER BY override_date DESC`;
  return [null, { overrides: rows.map((r: Record<string, unknown>) => ({
    override_id: String(r['override_id']), override_date: String(r['override_date']), override_date_end: (typeof r['override_date_end'] === 'string') ? r['override_date_end'] : null,
    is_available: Boolean(r['is_available']), reason: (typeof r['reason'] === 'string') ? r['reason'] : null,
  }))}];
}

export async function listSchedules(tx: postgres.Sql, input: Input): Promise<Result<unknown>> {
  if (input.provider_id == null) return [new Error('provider_id required'), null];
  const rows = await tx`SELECT schedule_id, day_of_week, start_time, end_time, is_active FROM provider_schedules WHERE provider_id = ${input.provider_id}::uuid ORDER BY day_of_week ASC`;
  return [null, { schedules: rows.map((r: Record<string, unknown>) => ({
    schedule_id: String(r['schedule_id']), day_of_week: Number(r['day_of_week']), start_time: String(r['start_time']), end_time: String(r['end_time']), is_active: Boolean(r['is_active']),
  }))}];
}
