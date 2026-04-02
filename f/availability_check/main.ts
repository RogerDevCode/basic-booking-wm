// ============================================================================
// AVAILABILITY CHECK — Get available time slots for a provider on a date
// ============================================================================
// Returns all bookable time slots for a provider on a given date:
// 1. Checks provider schedule for day-of-week
// 2. Checks for schedule overrides (blocked, modified hours)
// 3. Generates slots based on service duration + buffer
// 4. Removes slots that overlap with existing bookings
// 5. Returns available slots with metadata
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

type SqlClient = postgres.Sql;

const InputSchema = z.object({
  provider_id: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  service_id: z.uuid().optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  buffer_minutes: z.number().int().min(0).max(120).optional(),
});

interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}

interface AvailabilityResult {
  provider_id: string;
  provider_name: string;
  date: string;
  timezone: string;
  slots: TimeSlot[];
  total_available: number;
  total_booked: number;
  is_blocked: boolean;
  block_reason?: string;
}

// Typed row interfaces for postgres queries — avoids index signature issues
interface ProviderRow {
  provider_id: string;
  name: string;
  timezone: string;
}

interface ServiceRow {
  service_id: string;
  duration_minutes: number;
  buffer_minutes: number;
}

interface ScheduleRow {
  start_time: string;
  end_time: string;
}

interface OverrideRow {
  is_blocked: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
}

interface BookingSlotRow {
  start_time: string;
  end_time: string;
}

async function getProviderSchedule(
  sql: SqlClient,
  providerId: string,
  dayOfWeek: number
): Promise<ScheduleRow | null> {
  const [schedule] = await sql<ScheduleRow[]>`
    SELECT start_time, end_time FROM provider_schedules
    WHERE provider_id = ${providerId}::uuid
      AND day_of_week = ${dayOfWeek}
      AND is_active = true
    LIMIT 1
  `;
  return schedule ?? null;
}

async function getScheduleOverride(
  sql: SqlClient,
  providerId: string,
  date: string
): Promise<OverrideRow | null> {
  const [override] = await sql<OverrideRow[]>`
    SELECT is_blocked, start_time, end_time, reason FROM schedule_overrides
    WHERE provider_id = ${providerId}::uuid AND override_date = ${date}::date
    LIMIT 1
  `;
  return override ?? null;
}

async function getExistingBookings(
  sql: SqlClient,
  providerId: string,
  date: string
): Promise<BookingSlotRow[]> {
  return await sql<BookingSlotRow[]>`
    SELECT start_time, end_time FROM bookings
    WHERE provider_id = ${providerId}::uuid
      AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
      AND start_time >= ${date}::date
      AND start_time < (${date}::date + INTERVAL '1 day')
    ORDER BY start_time ASC
  `;
}

function generateSlots(
  dateStr: string,
  startTime: string,
  endTime: string,
  durationMinutes: number,
  bufferMinutes: number,
  bookedSlots: BookingSlotRow[]
): TimeSlot[] {
  const slots: TimeSlot[] = [];

  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  const baseDate = new Date(`${dateStr}T00:00:00`);
  const dayStart = new Date(baseDate);
  dayStart.setHours(startH ?? 9, startM ?? 0, 0, 0);
  const dayEnd = new Date(baseDate);
  dayEnd.setHours(endH ?? 17, endM ?? 0, 0, 0);

  const durationMs = durationMinutes * 60 * 1000;
  const bufferMs = bufferMinutes * 60 * 1000;

  let current = new Date(dayStart);

  while (current.getTime() + durationMs <= dayEnd.getTime()) {
    const slotEnd = new Date(current.getTime() + durationMs);

    const isBooked = bookedSlots.some((b) => {
      const bookedStart = new Date(b.start_time);
      const bookedEnd = new Date(b.end_time);
      return current.getTime() < bookedEnd.getTime() && bookedStart.getTime() < slotEnd.getTime();
    });

    slots.push({
      start: current.toISOString(),
      end: slotEnd.toISOString(),
      available: !isBooked,
    });

    current = new Date(slotEnd.getTime() + bufferMs);
  }

  return slots;
}

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: AvailabilityResult | null;
  error_message: string | null;
}> {
  try {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };
    }

    const { provider_id, date, service_id, duration_minutes, buffer_minutes } = parsed.data;

    const dbUrl = process.env['DATABASE_URL'];
    if (!dbUrl) {
      return { success: false, data: null, error_message: 'DATABASE_URL not configured' };
    }

    const sql = postgres(dbUrl, { ssl: 'require' });

    try {
      // Step 1: Get provider info (typed query)
      const [provider] = await sql<ProviderRow[]>`
        SELECT provider_id, name, timezone FROM providers
        WHERE provider_id = ${provider_id}::uuid AND is_active = true
        LIMIT 1
      `;

      if (!provider) {
        return { success: false, data: null, error_message: `Provider ${provider_id} not found or inactive` };
      }

      // Step 2: Get service duration/buffer if service_id provided (typed query)
      let effectiveDuration: number = duration_minutes ?? 30;
      let effectiveBuffer: number = buffer_minutes ?? 10;

      if (service_id) {
        const [service] = await sql<ServiceRow[]>`
          SELECT service_id, duration_minutes, buffer_minutes FROM services
          WHERE service_id = ${service_id}::uuid AND is_active = true
          LIMIT 1
        `;
        if (service) {
          effectiveDuration = service.duration_minutes;
          effectiveBuffer = service.buffer_minutes;
        }
      }

      // Step 3: Get day of week
      const dateObj = new Date(`${date}T00:00:00`);
      const dayOfWeek = dateObj.getUTCDay();

      // Step 4: Check for schedule override
      const override = await getScheduleOverride(sql, provider_id, date);

      if (override?.is_blocked) {
        return {
          success: true,
          data: {
            provider_id,
            provider_name: provider.name,
            date,
            timezone: provider.timezone,
            slots: [],
            total_available: 0,
            total_booked: 0,
            is_blocked: true,
            block_reason: override.reason ?? 'Provider unavailable on this date',
          },
          error_message: null,
        };
      }

      // Step 5: Get schedule (override hours or default)
      let scheduleStart: string | null = null;
      let scheduleEnd: string | null = null;

      if (override && override.start_time && override.end_time) {
        scheduleStart = override.start_time;
        scheduleEnd = override.end_time;
      } else {
        const schedule = await getProviderSchedule(sql, provider_id, dayOfWeek);
        if (schedule) {
          scheduleStart = schedule.start_time;
          scheduleEnd = schedule.end_time;
        }
      }

      if (!scheduleStart || !scheduleEnd) {
        return {
          success: true,
          data: {
            provider_id,
            provider_name: provider.name,
            date,
            timezone: provider.timezone,
            slots: [],
            total_available: 0,
            total_booked: 0,
            is_blocked: true,
            block_reason: 'Provider does not work on this day of week',
          },
          error_message: null,
        };
      }

      // Step 6: Get existing bookings
      const bookedSlots = await getExistingBookings(sql, provider_id, date);

      // Step 7: Generate slots
      const allSlots = generateSlots(
        date,
        scheduleStart,
        scheduleEnd,
        effectiveDuration,
        effectiveBuffer,
        bookedSlots
      );

      const availableSlots = allSlots.filter((s) => s.available);

      return {
        success: true,
        data: {
          provider_id,
          provider_name: provider.name,
          date,
          timezone: provider.timezone,
          slots: allSlots,
          total_available: availableSlots.length,
          total_booked: allSlots.length - availableSlots.length,
          is_blocked: false,
        },
        error_message: null,
      };
    } finally {
      await sql.end();
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { success: false, data: null, error_message: `Internal error: ${error.message}` };
  }
}
