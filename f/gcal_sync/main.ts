// ============================================================================
// GCal SYNC — Sync booking to Google Calendar (provider + patient)
// ============================================================================
// Syncs a booking to both provider and patient Google Calendars:
// 1. Fetches booking details from DB
// 2. Creates/updates GCal event for provider calendar
// 3. Creates/updates GCal event for patient calendar
// 4. Stores GCal event IDs in booking row
// 5. Updates gcal_sync_status
//
// Retry: 3 attempts with exponential backoff [1s, 3s, 9s]
// On failure: marks as 'pending' for reconciliation cron
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { buildGCalEvent } from '../internal/gcal_utils/buildGCalEvent';

const InputSchema = z.object({
  booking_id: z.uuid(),
  action: z.enum(['create', 'update', 'delete']).default('create'),
  max_retries: z.number().int().min(1).max(5).default(3),
});

interface GCalSyncResult {
  booking_id: string;
  provider_event_id: string | null;
  patient_event_id: string | null;
  sync_status: 'synced' | 'partial' | 'pending';
  retry_count: number;
  errors: string[];
}

// --- Typed Row Interface for the booking join query ---
interface BookingRow {
  booking_id: string;
  status: string;
  start_time: string;
  end_time: string;
  gcal_provider_event_id: string | null;
  gcal_patient_event_id: string | null;
  provider_name: string;
  provider_calendar_id: string | null;
  patient_name: string;
  patient_calendar_id: string | null;
  service_name: string;
}

// --- GCal API Response ---
interface GCalEventResponse {
  id: string;
  [key: string]: unknown;
}

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';

async function callGCalAPI(
  method: string,
  path: string,
  calendarId: string,
  body?: object
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  const accessToken = process.env['GCAL_ACCESS_TOKEN'];
  if (!accessToken) {
    return { ok: false, error: 'GCAL_ACCESS_TOKEN not configured' };
  }

  const url = `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/${path}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : null,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const isTransient = response.status >= 500 || response.status === 429;
      return {
        ok: false,
        error: `GCal API ${String(response.status)} (${isTransient ? 'transient' : 'permanent'}): ${errorText}`,
      };
    }

    const data = await response.json() as Record<string, unknown>;
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: `Network error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function retryWithBackoff<T>(
  fn: () => Promise<{ ok: boolean; data?: T; error?: string }>,
  maxRetries: number
): Promise<{ ok: boolean; data?: T; error?: string }> {
  let lastError = 'Unknown error';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await fn();
    if (result.ok) return result;

    lastError = result.error ?? 'Unknown error';

    // Don't retry on permanent errors (4xx except 429)
    if (lastError.includes('(permanent)')) return result;

    if (attempt < maxRetries - 1) {
      const backoffMs = Math.pow(3, attempt) * 1000; // 1s, 3s, 9s
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  return { ok: false, error: `Failed after ${String(maxRetries)} retries: ${lastError}` };
}

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: GCalSyncResult | null;
  error_message: string | null;
}> {
  try {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };
    }

    const { booking_id, action, max_retries } = parsed.data;

    const dbUrl = process.env['DATABASE_URL'];
    if (!dbUrl) {
      return { success: false, data: null, error_message: 'DATABASE_URL not configured' };
    }

    const sql = postgres(dbUrl, { ssl: 'require' });

    try {
      // Step 1: Fetch booking details (fully typed)
      const [booking] = await sql<BookingRow[]>`
        SELECT b.booking_id, b.status, b.start_time, b.end_time,
               b.gcal_provider_event_id, b.gcal_patient_event_id,
               p.name as provider_name, p.gcal_calendar_id as provider_calendar_id,
               pt.name as patient_name, pt.gcal_calendar_id as patient_calendar_id,
               s.name as service_name
        FROM bookings b
        JOIN providers p ON p.provider_id = b.provider_id
        JOIN patients pt ON pt.patient_id = b.patient_id
        JOIN services s ON s.service_id = b.service_id
        WHERE b.booking_id = ${booking_id}::uuid
        LIMIT 1
      `;

      if (!booking) {
        return { success: false, data: null, error_message: `Booking ${booking_id} not found` };
      }

      const result: GCalSyncResult = {
        booking_id,
        provider_event_id: booking.gcal_provider_event_id,
        patient_event_id: booking.gcal_patient_event_id,
        sync_status: 'pending',
        retry_count: 0,
        errors: [],
      };

      // Step 2: Handle delete action
      if (action === 'delete') {
        if (booking.gcal_provider_event_id && booking.provider_calendar_id) {
          const deleteResult = await retryWithBackoff(
            () => callGCalAPI('DELETE', `events/${booking.gcal_provider_event_id}`, booking.provider_calendar_id!),
            max_retries
          );
          if (!deleteResult.ok) {
            result.errors.push(`Provider event delete failed: ${deleteResult.error ?? 'Unknown error'}`);
          }
        }
        if (booking.gcal_patient_event_id && booking.patient_calendar_id) {
          const deleteResult = await retryWithBackoff(
            () => callGCalAPI('DELETE', `events/${booking.gcal_patient_event_id}`, booking.patient_calendar_id!),
            max_retries
          );
          if (!deleteResult.ok) {
            result.errors.push(`Patient event delete failed: ${deleteResult.error ?? 'Unknown error'}`);
          }
        }

        result.sync_status = result.errors.length === 0 ? 'synced' : 'partial';

        await sql`
          UPDATE bookings
          SET gcal_sync_status = ${result.sync_status},
              gcal_last_sync = NOW(),
              gcal_provider_event_id = null,
              gcal_patient_event_id = null
          WHERE booking_id = ${booking_id}::uuid
        `;

        return { success: true, data: result, error_message: null };
      }

      // Build event body from shared util
      const eventBody = buildGCalEvent({
        booking_id: booking.booking_id,
        status: booking.status,
        start_time: booking.start_time,
        end_time: booking.end_time,
        provider_name: booking.provider_name,
        service_name: booking.service_name,
      });

      // Step 3: Create/update provider event
      if (booking.provider_calendar_id) {
        const providerResult = await retryWithBackoff(
          () => {
            if (booking.gcal_provider_event_id) {
              return callGCalAPI('PUT', `events/${booking.gcal_provider_event_id}`, booking.provider_calendar_id!, eventBody);
            }
            return callGCalAPI('POST', 'events', booking.provider_calendar_id!, eventBody);
          },
          max_retries
        );

        if (providerResult.ok && providerResult.data) {
          result.provider_event_id = (providerResult.data as GCalEventResponse).id;
        } else {
          result.errors.push(`Provider event failed: ${providerResult.error ?? 'Unknown error'}`);
        }
      }

      // Step 4: Create/update patient event
      if (booking.patient_calendar_id) {
        const patientResult = await retryWithBackoff(
          () => {
            if (booking.gcal_patient_event_id) {
              return callGCalAPI('PUT', `events/${booking.gcal_patient_event_id}`, booking.patient_calendar_id!, eventBody);
            }
            return callGCalAPI('POST', 'events', booking.patient_calendar_id!, eventBody);
          },
          max_retries
        );

        if (patientResult.ok && patientResult.data) {
          result.patient_event_id = (patientResult.data as GCalEventResponse).id;
        } else {
          result.errors.push(`Patient event failed: ${patientResult.error ?? 'Unknown error'}`);
        }
      }

      // Step 5: Determine sync status
      if (result.errors.length === 0) {
        result.sync_status = 'synced';
      } else if (result.provider_event_id || result.patient_event_id) {
        result.sync_status = 'partial';
      } else {
        result.sync_status = 'pending';
      }

      // Step 6: Update booking with GCal event IDs
      await sql`
        UPDATE bookings
        SET gcal_provider_event_id = ${result.provider_event_id},
            gcal_patient_event_id = ${result.patient_event_id},
            gcal_sync_status = ${result.sync_status},
            gcal_last_sync = NOW(),
            gcal_retry_count = ${result.errors.length > 0 ? 1 : 0}
        WHERE booking_id = ${booking_id}::uuid
      `;

      return { success: true, data: result, error_message: null };
    } finally {
      await sql.end();
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { success: false, data: null, error_message: `Internal error: ${error.message}` };
  }
}
