import postgres from 'postgres';
import type { BookingRecord, ReminderWindow } from './types';

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
  return tx`
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
  return tx`
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
  return tx`
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
