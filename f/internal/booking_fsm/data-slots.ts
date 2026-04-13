/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Query available time slots for a doctor on a given date
 * DB Tables Used  : provider_schedules, bookings, services
 * Concurrency Risk: NO — read-only query
 * GCal Calls      : NO
 * Idempotency Key : NO — read-only
 * RLS Tenant ID   : YES — query runs within withTenantContext
 * Zod Schemas     : YES — output validated
 */

// ============================================================================
// BOOKING FSM — Data: Available Time Slots
// ============================================================================
// Calculates available time slots for a provider on a specific date.
// Combines provider_schedules with existing bookings to find free slots.
// Caller must provide a SQL client that is already within a tenant context.
// ============================================================================

import { z } from 'zod';
import type postgres from 'postgres';

const ScheduleRowSchema = z.object({
  day_of_week: z.number().int(),
  start_time: z.string(),
  end_time: z.string(),
});

const BookingRowSchema = z.object({
  start_time: z.string(),
  end_time: z.string(),
});

const ServiceRowSchema = z.object({
  duration_minutes: z.number().int().positive(),
  buffer_minutes: z.number().int().default(0),
});

export interface TimeSlot {
  readonly id: string;
  readonly label: string;
  readonly start_time: string;
}

export interface FetchSlotsResult {
  readonly slots: ReadonlyArray<TimeSlot>;
}


/**
 * fetchSlots — Returns available time slots for a provider on a given date.
 * The sql client must already be inside withTenantContext.
 */
export async function fetchSlots(
  sql: postgres.Sql,
  providerId: string,
  date: string, // YYYY-MM-DD
): Promise<[Error | null, FetchSlotsResult | null]> {
  try {
    // Get day of week (0=Sunday, 6=Saturday)
    const dayOfWeek = new Date(date + 'T00:00:00').getDay();

    // Fetch provider schedule for this day
    const scheduleRows = await sql`
      SELECT day_of_week, start_time::text, end_time::text
      FROM provider_schedules
      WHERE provider_id = ${providerId}::uuid
        AND day_of_week = ${dayOfWeek}
      ORDER BY start_time ASC
    `;

    const scheduleValidated = z.array(ScheduleRowSchema).safeParse(scheduleRows);
    if (!scheduleValidated.success) {
      return [new Error(`Invalid schedule rows: ${scheduleValidated.error.message}`), null];
    }

    if (scheduleValidated.data.length === 0) {
      return [null, { slots: [] }]; // No schedule for this day
    }

    // Fetch service duration (use first active service as default)
    const serviceRows = await sql`
      SELECT duration_minutes, buffer_minutes
      FROM services
      WHERE is_active = true
      LIMIT 1
    `;

    const serviceValidated = z.array(ServiceRowSchema).safeParse(serviceRows);
    if (!serviceValidated.success || serviceValidated.data.length === 0) {
      return [new Error('No active services found'), null];
    }

    const firstService = serviceValidated.data[0];
    const slotDuration = firstService!.duration_minutes;
    const bufferMinutes = firstService!.buffer_minutes;
    const totalSlotMinutes = slotDuration + bufferMinutes;

    // Fetch existing bookings for this date
    const dayStart = `${date}T00:00:00`;
    const dayEnd = `${date}T23:59:59`;

    const bookingRows = await sql`
      SELECT start_time::text, end_time::text
      FROM bookings
      WHERE provider_id = ${providerId}::uuid
        AND status NOT IN ('cancelada', 'no_presentado', 'reagendada')
        AND start_time >= ${dayStart}::timestamptz
        AND start_time < ${dayEnd}::timestamptz
    `;

    const bookingValidated = z.array(BookingRowSchema).safeParse(bookingRows);
    if (!bookingValidated.success) {
      return [new Error(`Invalid booking rows: ${bookingValidated.error.message}`), null];
    }

    // Build booked intervals
    const bookedIntervals = bookingValidated.data.map(b => ({
      start: new Date(b.start_time).getTime(),
      end: new Date(b.end_time).getTime(),
    }));

    // Generate available slots
    const slots: TimeSlot[] = [];
    let slotIndex = 1;

    for (const schedule of scheduleValidated.data) {
      const [schedHour, schedMin] = schedule.start_time.split(':').map(Number);
      const [endHour, endMin] = schedule.end_time.split(':').map(Number);

      let current = new Date(`${date}T${String(schedHour).padStart(2, '0')}:${String(schedMin).padStart(2, '0')}:00`).getTime();
      const end = new Date(`${date}T${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00`).getTime();

      while (current + slotDuration * 60000 <= end) {
        const slotEnd = current + slotDuration * 60000;

        // Check if this slot overlaps with any booking
        const isBooked = bookedIntervals.some(b =>
          current < b.end && slotEnd > b.start,
        );

        if (!isBooked) {
          const slotDate = new Date(current);
          const hours = slotDate.getHours();
          const minutes = slotDate.getMinutes();
          const ampm = hours >= 12 ? 'PM' : 'AM';
          const displayHours = hours % 12 || 12;
          const label = `${displayHours}:${String(minutes).padStart(2, '0')} ${ampm}`;

          slots.push({
            id: String(slotIndex),
            label,
            start_time: slotDate.toISOString(),
          });
          slotIndex++;
        }

        current += totalSlotMinutes * 60000;
      }
    }

    return [null, { slots }];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`fetch_slots_failed: ${msg}`), null];
  }
}
