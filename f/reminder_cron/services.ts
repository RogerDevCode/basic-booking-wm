import postgres from 'postgres';
import type { BookingRecord, ReminderPrefs, ReminderWindow, ScriptResponse } from './types';

const MODULE = 'reminder_cron:services';

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

export async function sendTelegramReminder(
  chatId: string,
  messageType: string,
  details: Record<string, string>,
  buttons: { text: string; callback_data: string }[]
): Promise<{ sent: boolean; error: string | null }> {
  try {
    const botToken = process.env['TELEGRAM_BOT_TOKEN'];
    if (!botToken) return { sent: false, error: 'TELEGRAM_BOT_TOKEN not configured' };

    const url = `${process.env['WINDMILL_BASE_URL'] ?? ''}/api/scripts/f/telegram_send`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_type: messageType,
        booking_details: details,
        inline_buttons: buttons,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return { sent: false, error: `HTTP ${String(response.status)}` };
    }

    const result = (await response.json()) as ScriptResponse;
    return { sent: result.success === true, error: result.error_message ?? null };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendGmailReminder(
  email: string,
  messageType: string,
  details: Record<string, string>,
  bookingId: string
): Promise<{ sent: boolean; error: string | null }> {
  try {
    const baseUrl = process.env['WINDMILL_BASE_URL'] ?? '';
    const actionLinks = [
      { text: 'Confirmar Cita', url: `${baseUrl}/api/webhooks/booking/confirm?id=${bookingId}`, style: 'primary' as const },
      { text: 'Cancelar Cita', url: `${baseUrl}/api/webhooks/booking/cancel?id=${bookingId}`, style: 'danger' as const },
      { text: 'Reprogramar', url: `${baseUrl}/api/webhooks/booking/reschedule?id=${bookingId}`, style: 'secondary' as const },
    ];

    const url = `${baseUrl}/api/scripts/f/gmail_send`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient_email: email,
        message_type: messageType,
        booking_details: details,
        action_links: actionLinks,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return { sent: false, error: `HTTP ${String(response.status)}` };
    }

    const result = (await response.json()) as ScriptResponse;
    return { sent: result.success === true, error: result.error_message ?? null };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function markReminder24hSent(tx: postgres.Sql, bookingId: string): Promise<void> {
  await tx`
    UPDATE bookings
    SET reminder_24h_sent = true, updated_at = NOW()
    WHERE booking_id = ${bookingId}::uuid
  `;
}

export async function markReminder2hSent(tx: postgres.Sql, bookingId: string): Promise<void> {
  await tx`
    UPDATE bookings
    SET reminder_2h_sent = true, updated_at = NOW()
    WHERE booking_id = ${bookingId}::uuid
  `;
}

export async function markReminder30minSent(tx: postgres.Sql, bookingId: string): Promise<void> {
  await tx`
    UPDATE bookings
    SET reminder_30min_sent = true, updated_at = NOW()
    WHERE booking_id = ${bookingId}::uuid
  `;
}

export async function markReminderSent(tx: postgres.Sql, bookingId: string, window: ReminderWindow): Promise<void> {
  if (window === '24h') return markReminder24hSent(tx, bookingId);
  if (window === '2h') return markReminder2hSent(tx, bookingId);
  return markReminder30minSent(tx, bookingId);
}

export async function getBookingsFor24h(
  tx: postgres.Sql,
  start: Date,
  end: Date
): Promise<BookingRecord[]> {
  return tx<BookingRecord[]>`
    SELECT
      b.booking_id, b.client_id, b.provider_id,
      b.start_time, b.end_time, b.status,
      b.reminder_24h_sent, b.reminder_2h_sent, b.reminder_30min_sent,
      p.telegram_chat_id AS client_telegram_chat_id,
      p.email AS client_email,
      p.name AS client_name,
      p.metadata AS reminder_preferences,
      pr.name AS provider_name,
      s.name AS service_name
    FROM bookings b
    JOIN clients p ON p.client_id = b.client_id
    LEFT JOIN providers pr ON pr.provider_id = b.provider_id
    LEFT JOIN services s ON s.service_id = b.service_id
    WHERE b.status = 'confirmed'
      AND b.start_time >= ${start.toISOString()}
      AND b.start_time <= ${end.toISOString()}
      AND b.reminder_24h_sent = false
    ORDER BY b.start_time ASC
    LIMIT 100
  `;
}

export async function getBookingsFor2h(
  tx: postgres.Sql,
  start: Date,
  end: Date
): Promise<BookingRecord[]> {
  return tx<BookingRecord[]>`
    SELECT
      b.booking_id, b.client_id, b.provider_id,
      b.start_time, b.end_time, b.status,
      b.reminder_24h_sent, b.reminder_2h_sent, b.reminder_30min_sent,
      p.telegram_chat_id AS client_telegram_chat_id,
      p.email AS client_email,
      p.name AS client_name,
      p.metadata AS reminder_preferences,
      pr.name AS provider_name,
      s.name AS service_name
    FROM bookings b
    JOIN clients p ON p.client_id = b.client_id
    LEFT JOIN providers pr ON pr.provider_id = b.provider_id
    LEFT JOIN services s ON s.service_id = b.service_id
    WHERE b.status = 'confirmed'
      AND b.start_time >= ${start.toISOString()}
      AND b.start_time <= ${end.toISOString()}
      AND b.reminder_2h_sent = false
    ORDER BY b.start_time ASC
    LIMIT 100
  `;
}

export async function getBookingsFor30min(
  tx: postgres.Sql,
  start: Date,
  end: Date
): Promise<BookingRecord[]> {
  return tx<BookingRecord[]>`
    SELECT
      b.booking_id, b.client_id, b.provider_id,
      b.start_time, b.end_time, b.status,
      b.reminder_24h_sent, b.reminder_2h_sent, b.reminder_30min_sent,
      p.telegram_chat_id AS client_telegram_chat_id,
      p.email AS client_email,
      p.name AS client_name,
      p.metadata AS reminder_preferences,
      pr.name AS provider_name,
      s.name AS service_name
    FROM bookings b
    JOIN clients p ON p.client_id = b.client_id
    LEFT JOIN providers pr ON pr.provider_id = b.provider_id
    LEFT JOIN services s ON s.service_id = b.service_id
    WHERE b.status = 'confirmed'
      AND b.start_time >= ${start.toISOString()}
      AND b.start_time <= ${end.toISOString()}
      AND b.reminder_30min_sent = false
    ORDER BY b.start_time ASC
    LIMIT 100
  `;
}

export async function getBookingsForWindow(
  tx: postgres.Sql,
  window: ReminderWindow,
  start: Date,
  end: Date
): Promise<BookingRecord[]> {
  if (window === '24h') return getBookingsFor24h(tx, start, end);
  if (window === '2h') return getBookingsFor2h(tx, start, end);
  return getBookingsFor30min(tx, start, end);
}