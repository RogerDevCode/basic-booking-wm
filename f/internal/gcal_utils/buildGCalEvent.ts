import { DEFAULT_TIMEZONE } from '../config';
// ============================================================================
// GCAL UTILS — Shared Google Calendar utilities
// ============================================================================
// Extracted from gcal_sync/main.ts and gcal_reconcile/main.ts to avoid
// code duplication. Both scripts use this function to build GCal events.
// ============================================================================

export interface BookingEventData {
  booking_id: string;
  status: string;
  start_time: string;
  end_time: string;
  provider_name: string;
  service_name: string;
}

export interface GoogleCalendarEvent {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  status: 'confirmed' | 'cancelled' | 'tentative';
  reminders: {
    useDefault: boolean;
    overrides: { method: 'popup' | 'email'; minutes: number }[];
  };
}

/**
 * Builds a Google Calendar event object from a booking record.
 * Used by both gcal_sync (realtime) and gcal_reconcile (cron retry).
 *
 * @param booking - Booking data with provider and service info
 * @param calendarType - 'provider' or 'client' (reserved for future per-type customization)
 */
export function buildGCalEvent(
  booking: BookingEventData,
  calendarType: 'provider' | 'client' = 'provider'
): GoogleCalendarEvent {
  // calendarType reserved for future per-audience event customization
  void calendarType;

  const title = booking.status === 'cancelled'
    ? `[CANCELLED] Cita Médica - ${booking.provider_name}`
    : `Cita Médica - ${booking.provider_name}`;

  const description = [
    `Servicio: ${booking.service_name}`,
    `ID de cita: ${booking.booking_id}`,
    `Estado: ${booking.status}`,
    '',
    booking.status === 'cancelled'
      ? 'Esta cita ha sido cancelada.'
      : 'Para cancelar o reagendar, contacta a través de Telegram.',
  ].join('\n');

  return {
    summary: title,
    description,
    start: { dateTime: booking.start_time, timeZone: DEFAULT_TIMEZONE },
    end: { dateTime: booking.end_time, timeZone: DEFAULT_TIMEZONE },
    status: booking.status === 'cancelled' ? 'cancelled' : 'confirmed',
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 1440 }, // 24h
        { method: 'popup', minutes: 120 },  // 2h
        { method: 'popup', minutes: 30 },   // 30min
      ],
    },
  };
}
