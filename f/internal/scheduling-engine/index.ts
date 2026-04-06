// ============================================================================
// SCHEDULING ENGINE — Availability computation for medical booking
// ============================================================================
// 3-layer architecture:
//   Layer 1: schedule_rules (recurring weekly pattern)
//   Layer 2: schedule_overrides (date-specific exceptions, ranges)
//   Layer 3: bookings (consumed time)
//
// Algorithm: on-demand slot generation (no pre-generation)
// Pattern: Go-style errors as values, no throw, strict typing
// ============================================================================

import postgres from 'postgres';

// ─── Domain Types ───────────────────────────────────────────────────────────

export interface TimeSlot {
  readonly start: string;
  readonly end: string;
  readonly available: boolean;
}

export interface AvailabilityQuery {
  readonly provider_id: string;
  readonly date: string;
  readonly service_id: string;
}

export interface AvailabilityResult {
  readonly provider_id: string;
  readonly date: string;
  readonly timezone: string;
  readonly slots: readonly TimeSlot[];
  readonly total_available: number;
  readonly total_booked: number;
  readonly is_blocked: boolean;
  readonly block_reason: string | null;
}

// ─── DB Row Types ───────────────────────────────────────────────────────────

interface ScheduleOverrideRow {
  readonly override_id: string;
  readonly provider_id: string;
  readonly override_date: string;
  readonly override_date_end: string;
  readonly is_available: boolean;
  readonly start_time: string | null;
  readonly end_time: string | null;
  readonly reason: string | null;
}

interface ProviderScheduleRow {
  readonly schedule_id: string;
  readonly provider_id: string;
  readonly day_of_week: number;
  readonly start_time: string;
  readonly end_time: string;
  readonly is_active: boolean;
}

interface BookingTimeRow {
  readonly start_time: string;
  readonly end_time: string;
}

interface ServiceRow {
  readonly service_id: string;
  readonly duration_minutes: number;
  readonly buffer_minutes: number;
}

export interface AffectedBooking {
  readonly booking_id: string;
  readonly start_time: string;
  readonly client_name: string;
}

// ─── Result Type ────────────────────────────────────────────────────────────

type Result<T> = [Error | null, T | null];

// ─── Public API ─────────────────────────────────────────────────────────────

export async function getAvailability(
  sql: postgres.Sql,
  query: AvailabilityQuery,
): Promise<Result<AvailabilityResult>> {
  const targetDate = query.date;
  const dayOfWeek = new Date(targetDate + 'T00:00:00Z').getUTCDay();

  try {
    // Layer 2: Check for blocking overrides (date range)
    const overrides = await sql<ScheduleOverrideRow[]>`
      SELECT * FROM schedule_overrides
      WHERE provider_id = ${query.provider_id}::uuid
        AND ${targetDate}::date BETWEEN override_date AND COALESCE(override_date_end, override_date)
    `;

    const blockingOverride = overrides.find(o => !o.is_available);
    if (blockingOverride != null) {
      return [null, {
        provider_id: query.provider_id,
        date: targetDate,
        timezone: 'UTC',
        slots: [],
        total_available: 0,
        total_booked: 0,
        is_blocked: true,
        block_reason: blockingOverride.reason ?? 'Día no disponible',
      }];
    }

    // Check for special-hours override
    const specialOverride = overrides.find(o => o.is_available && o.start_time != null && o.end_time != null);

    // Layer 1: Get schedule rules for this day of week
    let rules: ProviderScheduleRow[];
    if (specialOverride != null) {
      rules = [{
        schedule_id: specialOverride.override_id,
        provider_id: specialOverride.provider_id,
        day_of_week: dayOfWeek,
        start_time: specialOverride.start_time,
        end_time: specialOverride.end_time,
        is_active: true,
      } as ProviderScheduleRow];
    } else {
      const fetchedRules = await sql<ProviderScheduleRow[]>`
        SELECT * FROM provider_schedules
        WHERE provider_id = ${query.provider_id}::uuid
          AND day_of_week = ${dayOfWeek} AND is_active = true
      `;
      rules = fetchedRules;
    }

    if (rules.length === 0) {
      return [null, {
        provider_id: query.provider_id,
        date: targetDate,
        timezone: 'UTC',
        slots: [],
        total_available: 0,
        total_booked: 0,
        is_blocked: true,
        block_reason: 'No hay horario para este día de la semana',
      }];
    }

    // Layer 3: Get existing bookings for this day
    const bookings = await sql<BookingTimeRow[]>`
      SELECT start_time, end_time FROM bookings
      WHERE provider_id = ${query.provider_id}::uuid
        AND start_time >= ${targetDate}::date
        AND start_time < (${targetDate}::date + INTERVAL '1 day')
        AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
    `;

    // Get service duration + buffer
    const services = await sql<ServiceRow[]>`
      SELECT service_id, duration_minutes, buffer_minutes FROM services
      WHERE service_id = ${query.service_id}::uuid LIMIT 1
    `;

    const service = services[0];
    if (service == null) {
      return [new Error('Service not found'), null];
    }

    const slotDuration = service.duration_minutes + service.buffer_minutes;

    // Generate slots for each rule (supports multiple shifts per day)
    const allSlots: TimeSlot[] = [];
    for (const rule of rules) {
      const ruleSlots = generateSlotsForRule(rule, targetDate, slotDuration, bookings);
      allSlots.push(...ruleSlots);
    }

    const availableCount = allSlots.filter(s => s.available).length;
    const bookedCount = allSlots.filter(s => !s.available).length;

    return [null, {
      provider_id: query.provider_id,
      date: targetDate,
      timezone: 'UTC',
      slots: allSlots,
      total_available: availableCount,
      total_booked: bookedCount,
      is_blocked: false,
      block_reason: null,
    }];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}

export async function getAvailabilityRange(
  sql: postgres.Sql,
  providerId: string,
  serviceId: string,
  dateFrom: string,
  dateTo: string,
): Promise<Result<AvailabilityResult[]>> {
  const results: AvailabilityResult[] = [];
  const current = new Date(dateFrom + 'T00:00:00Z');
  const end = new Date(dateTo + 'T23:59:59Z');

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    if (dateStr != null) {
      const [err, result] = await getAvailability(sql, {
        provider_id: providerId,
        date: dateStr,
        service_id: serviceId,
      });
      if (err != null) return [err, null];
      if (result != null) results.push(result);
    }
    current.setDate(current.getDate() + 1);
  }

  return [null, results];
}

// ─── Override Validation ────────────────────────────────────────────────────

export interface OverrideValidation {
  readonly hasBookings: boolean;
  readonly bookingCount: number;
  readonly affectedBookings: readonly AffectedBooking[];
}

export async function validateOverride(
  sql: postgres.Sql,
  providerId: string,
  dateStart: string,
  dateEnd: string,
): Promise<Result<OverrideValidation>> {
  try {
    const rows = await sql`
      SELECT b.booking_id, b.start_time, p.name as client_name
      FROM bookings b
      JOIN clients p ON p.client_id = b.client_id
      WHERE b.provider_id = ${providerId}::uuid
        AND b.start_time >= ${dateStart}::date
        AND b.start_time < (${dateEnd}::date + INTERVAL '1 day')
        AND b.status NOT IN ('cancelled', 'no_show', 'rescheduled')
    `;

    const affected = rows.map(r => ({
      booking_id: String(r['booking_id']),
      start_time: String(r['start_time']),
      client_name: String(r['client_name']),
    }));

    return [null, {
      hasBookings: affected.length > 0,
      bookingCount: affected.length,
      affectedBookings: affected,
    }];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}

// ─── Internal: Slot Generation ──────────────────────────────────────────────

function generateSlotsForRule(
  rule: ProviderScheduleRow,
  date: string,
  slotDurationMin: number,
  bookings: readonly BookingTimeRow[],
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const startMin = timeToMinutes(rule.start_time);
  const endMin = timeToMinutes(rule.end_time);

  const year = parseInt(date.slice(0, 4), 10);
  const month = parseInt(date.slice(5, 7), 10) - 1;
  const day = parseInt(date.slice(8, 10), 10);

  let currentMin = startMin;
  while (currentMin + slotDurationMin <= endMin) {
    const slotStartMin = currentMin;
    const slotEndMin = currentMin + slotDurationMin;

    const slotStart = new Date(Date.UTC(year, month, day, Math.floor(slotStartMin / 60), slotStartMin % 60));
    const slotEnd = new Date(Date.UTC(year, month, day, Math.floor(slotEndMin / 60), slotEndMin % 60));

    const isBooked = bookings.some(b => {
      const bStart = new Date(b.start_time).getTime();
      const bEnd = new Date(b.end_time).getTime();
      return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart;
    });

    slots.push({
      start: slotStart.toISOString(),
      end: slotEnd.toISOString(),
      available: !isBooked,
    });

    currentMin += slotDurationMin;
  }

  return slots;
}

function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0] ?? '0', 10);
  const minutes = parseInt(parts[1] ?? '0', 10);
  return hours * 60 + minutes;
}
