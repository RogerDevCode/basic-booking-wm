import type { Result } from '../internal/result/index.ts';
import { withTenantContext } from '../internal/tenant-context/index.ts';
import { type BookingDetails, type Sql } from "./types.ts";

export async function fetchBookingDetails(sql: Sql, tenantId: string, bookingId: string): Promise<Result<BookingDetails>> {
    return withTenantContext(sql, tenantId, async (tx) => {
    interface BookingRow {
      booking_id: string;
      provider_id: string;
      status: string;
      start_time: Date;
      end_time: Date;
      gcal_provider_event_id: string | null;
      gcal_client_event_id: string | null;
      provider_name: string;
      provider_calendar_id: string | null;
      provider_gcal_access_token: string | null;
      provider_gcal_refresh_token: string | null;
      provider_gcal_client_id: string | null;
      provider_gcal_client_secret: string | null;
      client_calendar_id: string | null;
      service_name: string;
    }
    const rows = await tx<BookingRow[]>`
      SELECT b.booking_id, b.provider_id, b.status, b.start_time, b.end_time,
             b.gcal_provider_event_id, b.gcal_client_event_id,
             p.name as provider_name, p.gcal_calendar_id as provider_calendar_id,
             p.gcal_access_token as provider_gcal_access_token,
             p.gcal_refresh_token as provider_gcal_refresh_token,
             p.gcal_client_id as provider_gcal_client_id,
             p.gcal_client_secret as provider_gcal_client_secret,
             pt.name as client_name, pt.gcal_calendar_id as client_calendar_id,
             s.name as service_name
      FROM bookings b
      JOIN providers p ON p.provider_id = b.provider_id
      JOIN clients pt ON pt.client_id = b.client_id
      JOIN services s ON s.service_id = b.service_id
      WHERE b.booking_id = ${bookingId}::uuid
      LIMIT 1
    `;

    if (rows.length === 0) {
      return [new Error(`Booking ${bookingId} not found`), null];
    }

    const r = rows[0];
    if (!r) {
      return [new Error(`Booking ${bookingId} row is undefined`), null];
    }
    const details: BookingDetails = {
      booking_id:             r.booking_id,
      provider_id:            r.provider_id,
      status:                 r.status,
      start_time:             r.start_time.toISOString(),
      end_time:               r.end_time.toISOString(),
      gcal_provider_event_id: r.gcal_provider_event_id,
      gcal_client_event_id:   r.gcal_client_event_id,
      provider_name:          r.provider_name,
      provider_calendar_id:   r.provider_calendar_id,
      provider_gcal_access_token: r.provider_gcal_access_token,
      provider_gcal_refresh_token: r.provider_gcal_refresh_token,
      provider_gcal_client_id: r.provider_gcal_client_id,
      provider_gcal_client_secret: r.provider_gcal_client_secret,
      client_calendar_id:     r.client_calendar_id,
      service_name:           r.service_name,
    };

    return [null, details];
    });
}
