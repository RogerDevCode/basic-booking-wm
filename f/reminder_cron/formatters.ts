import type { BookingRecord, ReminderWindow, ReminderPrefs } from './types';

export function formatDate(date: Date, tz: string): string {
  return date.toLocaleDateString('es-AR', {
    timeZone: tz,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatTime(date: Date, tz: string): string {
  return date.toLocaleTimeString('es-AR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getClientPreference(
  prefs: ReminderPrefs | null,
  channel: string,
  window: string
): boolean {
  if (!prefs) return true;
  const key = `${channel}_${window}`;
  const value = prefs[key];
  if (typeof value === 'boolean') return value;
  return true;
}

export function buildBookingDetails(
  booking: BookingRecord,
  tz: string
): Record<string, string> {
  return {
    date: formatDate(booking.start_time, tz),
    time: formatTime(booking.start_time, tz),
    provider_name: booking.provider_name ?? 'Tu doctor',
    service: booking.service_name ?? 'Consulta',
    booking_id: booking.booking_id.slice(0, 8).toUpperCase(),
    client_name: booking.client_name ?? 'Paciente',
  };
}

export function buildInlineButtons(
  bookingId: string,
  window: ReminderWindow
): { text: string; callback_data: string }[] {
  const shortId = bookingId.slice(0, 60);
  const buttons: { text: string; callback_data: string }[] = [];

  if (window === '24h') {
    buttons.push(
      { text: '✅ Confirmar', callback_data: `cnf:${shortId}` },
      { text: '❌ Cancelar', callback_data: `cxl:${shortId}` },
      { text: '🔄 Reprogramar', callback_data: `res:${shortId}` }
    );
  } else if (window === '2h') {
    buttons.push(
      { text: '✅ Voy a asistir', callback_data: `ack:${shortId}` },
      { text: '❌ Cancelar', callback_data: `cxl:${shortId}` }
    );
  } else {
    buttons.push(
      { text: '👍 En camino', callback_data: `ack:${shortId}` }
    );
  }

  return buttons;
}
