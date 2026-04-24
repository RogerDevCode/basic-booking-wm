import { buildGCalEvent } from '../internal/gcal_utils/buildGCalEvent.ts';
import { GCalEventSchema } from './types.ts';
import type { GCalAPIResult, BookingRow, SyncResult } from './types.ts';

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';

function isRecord(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null;
}

/** Safely extract 'id' from unknown GCal API response.
 *  Compliant with AGENTS.md §1.A.2: No 'as' casts. Use type guards.
 */
export function extractGCalId(data: unknown): string | null {
  if (isRecord(data)) {
    const id = data['id'];
    return typeof id === 'string' ? id : null;
  }
  return null;
}

export async function callGCalAPI(
  method: string,
  calendarId: string,
  path: string,
  body?: object
): Promise<GCalAPIResult> {
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
      return { ok: false, error: `GCal API ${String(response.status)}: ${errorText}` };
    }

    const raw = await response.json();
    const parsed = GCalEventSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: `Invalid GCal response: ${parsed.error.message}` };
    }
    return { ok: true, data: parsed.data };
  } catch (e) {
    return { ok: false, error: `Network error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function retryWithBackoff<T>(
  fn: () => Promise<{ ok: boolean; data?: T; error?: string }>,
  maxRetries: number
): Promise<{ ok: boolean; data?: T; error?: string }> {
  let lastError = 'Unknown error';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await fn();
    if (result.ok) return result;

    lastError = result.error ?? 'Unknown error';

    if (lastError.includes('(permanent)')) return result;

    if (attempt < maxRetries - 1) {
      const backoffMs = Math.pow(3, attempt) * 1000;
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  return { ok: false, error: `Failed after ${String(maxRetries)} retries: ${lastError}` };
}

export async function syncBookingToGCal(
  booking: BookingRow,
  maxRetries: number
): Promise<SyncResult> {
  const result: SyncResult = {
    providerEventId: booking.gcal_provider_event_id,
    clientEventId: booking.gcal_client_event_id,
    errors: [],
  };

  const eventBody = buildGCalEvent({
    booking_id: booking.booking_id,
    status: booking.status,
    start_time: typeof booking.start_time === 'string' ? booking.start_time : booking.start_time.toISOString(),
    end_time: typeof booking.end_time === 'string' ? booking.end_time : booking.end_time.toISOString(),
    provider_name: booking.provider_name,
    service_name: booking.service_name,
  });

  // Sync to provider calendar
  if (booking.provider_calendar_id) {
    const providerCalId = booking.provider_calendar_id;
    const providerResult = await retryWithBackoff(
      () => {
        if (result.providerEventId) {
          return callGCalAPI('PUT', providerCalId, `events/${result.providerEventId}`, eventBody);
        }
        return callGCalAPI('POST', providerCalId, 'events', eventBody);
      },
      maxRetries
    );

    if (providerResult.ok && providerResult.data) {
      result.providerEventId = extractGCalId(providerResult.data);
    } else {
      result.errors.push(`Provider: ${providerResult.error ?? 'Unknown error'}`);
    }
  }

  // Sync to client calendar
  if (booking.client_calendar_id) {
    const clientCalId = booking.client_calendar_id;
    const clientResult = await retryWithBackoff(
      () => {
        if (result.clientEventId) {
          return callGCalAPI('PUT', clientCalId, `events/${result.clientEventId}`, eventBody);
        }
        return callGCalAPI('POST', clientCalId, 'events', eventBody);
      },
      maxRetries
    );

    if (clientResult.ok && clientResult.data) {
      result.clientEventId = extractGCalId(clientResult.data);
    } else {
      result.errors.push(`Client: ${clientResult.error ?? 'Unknown error'}`);
    }
  }

  // Handle cancelled bookings - delete events
  if (booking.status === 'cancelled') {
    if (result.providerEventId && booking.provider_calendar_id) {
      const providerCalId = booking.provider_calendar_id;
      const eventId = result.providerEventId;
      const deleteResult = await retryWithBackoff(
        () => callGCalAPI('DELETE', providerCalId, `events/${eventId}`),
        maxRetries
      );
      if (deleteResult.ok) {
        result.providerEventId = null;
      } else {
        result.errors.push(`Provider delete: ${deleteResult.error ?? 'Unknown error'}`);
      }
    }
    if (result.clientEventId && booking.client_calendar_id) {
      const clientCalId = booking.client_calendar_id;
      const eventId = result.clientEventId;
      const deleteResult = await retryWithBackoff(
        () => callGCalAPI('DELETE', clientCalId, `events/${eventId}`),
        maxRetries
      );
      if (deleteResult.ok) {
        result.clientEventId = null;
      } else {
        result.errors.push(`Client delete: ${deleteResult.error ?? 'Unknown error'}`);
      }
    }
  }

  return result;
}
