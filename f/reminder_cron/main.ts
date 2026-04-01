// ============================================================================
// REMINDER CRON JOB — 24h + 2h + 30min Reminder Dispatcher
// ============================================================================
// Runs every 30 minutes via Windmill Schedule.
// Queries confirmed bookings within reminder windows and sends notifications.
// Respects patient reminder_preferences (channel + window toggles).
// ============================================================================

import { z } from 'zod';
import * as postgres from 'postgres';

const InputSchema = z.object({
  dry_run: z.boolean().optional().default(false),
  timezone: z.string().optional().default('America/Argentina/Buenos_Aires'),
});

type ReminderWindow = '24h' | '2h' | '30min';

interface BookingRecord {
  booking_id: string;
  patient_id: string;
  provider_id: string;
  start_time: Date;
  end_time: Date;
  status: string;
  reminder_24h_sent: boolean;
  reminder_2h_sent: boolean;
  reminder_30min_sent: boolean;
  patient_telegram_chat_id: string | null;
  patient_email: string | null;
  patient_name: string | null;
  provider_name: string | null;
  service_name: string | null;
  reminder_preferences: Record<string, unknown> | null;
}

function formatDate(date: Date, tz: string): string {
  return date.toLocaleDateString('es-AR', {
    timeZone: tz,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(date: Date, tz: string): string {
  return date.toLocaleTimeString('es-AR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getPatientPreference(
  prefs: Record<string, unknown> | null,
  channel: string,
  window: string
): boolean {
  if (!prefs) return true;
  const key = `${channel}_${window}`;
  const value = prefs[key];
  if (typeof value === 'boolean') return value;
  return true;
}

function buildBookingDetails(
  booking: BookingRecord,
  tz: string
): Record<string, string> {
  return {
    date: formatDate(booking.start_time, tz),
    time: formatTime(booking.start_time, tz),
    provider_name: booking.provider_name ?? 'Tu doctor',
    service: booking.service_name ?? 'Consulta',
    booking_id: booking.booking_id.substring(0, 8).toUpperCase(),
    patient_name: booking.patient_name ?? 'Paciente',
  };
}

function buildInlineButtons(
  bookingId: string,
  window: ReminderWindow
): Array<{ text: string; callback_data: string }> {
  const shortId = bookingId.substring(0, 60);
  const buttons: Array<{ text: string; callback_data: string }> = [];

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

async function sendTelegramReminder(
  chatId: string,
  messageType: string,
  details: Record<string, string>,
  buttons: Array<{ text: string; callback_data: string }>
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
      return { sent: false, error: `HTTP ${response.status}` };
    }

    const result = await response.json() as Record<string, unknown>;
    return { sent: result['success'] === true, error: result['error_message'] as string | null };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function sendGmailReminder(
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
      return { sent: false, error: `HTTP ${response.status}` };
    }

    const result = await response.json() as Record<string, unknown>;
    return { sent: result['success'] === true, error: result['error_message'] as string | null };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function markReminderSent(
  sql: postgres.Sql,
  bookingId: string,
  window: ReminderWindow
): Promise<void> {
  const column = window === '24h' ? 'reminder_24h_sent' : window === '2h' ? 'reminder_2h_sent' : 'reminder_30min_sent';
  await sql`UPDATE bookings SET ${sql.unsafe(column)} = true, updated_at = NOW() WHERE booking_id = ${bookingId}::uuid`;
}

export async function main(rawInput: unknown): Promise<{ success: boolean; data: unknown | null; error_message: string | null }> {
  try {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, data: null, error_message: `Invalid input: ${parsed.error.message}` };
    }

    const { dry_run, timezone } = parsed.data;

    const dbUrl = process.env['DATABASE_URL'];
    if (!dbUrl) {
      return { success: false, data: null, error_message: 'DATABASE_URL not configured' };
    }

    const sql = postgres(dbUrl, { ssl: 'require' });

    const now = new Date();
    const window24hStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const window24hEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    const window2hStart = new Date(now.getTime() + 110 * 60 * 1000);
    const window2hEnd = new Date(now.getTime() + 130 * 60 * 1000);
    const window30minStart = new Date(now.getTime() + 25 * 60 * 1000);
    const window30minEnd = new Date(now.getTime() + 35 * 60 * 1000);

    const result = {
      reminders_24h_sent: 0,
      reminders_2h_sent: 0,
      reminders_30min_sent: 0,
      errors: 0,
      dry_run,
      processed_bookings: [] as string[],
    };

    const processWindow = async (
      window: ReminderWindow,
      start: Date,
      end: Date,
      sentFlag: string
    ): Promise<void> => {
      const bookings = await sql<BookingRecord[]>`
        SELECT 
          b.booking_id,
          b.patient_id,
          b.provider_id,
          b.start_time,
          b.end_time,
          b.status,
          b.reminder_24h_sent,
          b.reminder_2h_sent,
          b.reminder_30min_sent,
          p.telegram_chat_id as patient_telegram_chat_id,
          p.email as patient_email,
          p.name as patient_name,
          p.reminder_preferences,
          pr.name as provider_name,
          s.name as service_name
        FROM bookings b
        JOIN patients p ON p.patient_id = b.patient_id
        LEFT JOIN providers pr ON pr.provider_id = b.provider_id
        LEFT JOIN services s ON s.service_id = b.service_id
        WHERE b.status = 'confirmed'
          AND b.start_time >= ${start.toISOString()}
          AND b.start_time <= ${end.toISOString()}
          AND b.${sql.unsafe(sentFlag)} = false
        ORDER BY b.start_time ASC
        LIMIT 100
      `;

      for (const booking of (bookings ?? [])) {
        result.processed_bookings.push(booking.booking_id);
        const details = buildBookingDetails(booking, timezone);
        const prefs = booking.reminder_preferences as Record<string, unknown> | null;
        const buttons = buildInlineButtons(booking.booking_id, window);

        if (dry_run) {
          result[window === '24h' ? 'reminders_24h_sent' : window === '2h' ? 'reminders_2h_sent' : 'reminders_30min_sent']++;
          continue;
        }

        const messageType = `reminder_${window}`;

        if (booking.patient_telegram_chat_id && getPatientPreference(prefs, 'telegram', window)) {
          const tgResult = await sendTelegramReminder(
            booking.patient_telegram_chat_id,
            messageType,
            details,
            buttons
          );
          if (!tgResult.sent) {
            result.errors++;
          }
        }

        if (booking.patient_email && getPatientPreference(prefs, 'gmail', window)) {
          const gmResult = await sendGmailReminder(
            booking.patient_email,
            messageType,
            details,
            booking.booking_id
          );
          if (!gmResult.sent) {
            result.errors++;
          }
        }

        await markReminderSent(sql, booking.booking_id, window);

        if (window === '24h') result.reminders_24h_sent++;
        else if (window === '2h') result.reminders_2h_sent++;
        else result.reminders_30min_sent++;
      }
    }

    await processWindow('24h', window24hStart, window24hEnd, 'reminder_24h_sent');
    await processWindow('2h', window2hStart, window2hEnd, 'reminder_2h_sent');
    await processWindow('30min', window30minStart, window30minEnd, 'reminder_30min_sent');

    await sql.end();

    return {
      success: true,
      data: result,
      error_message: null,
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { success: false, data: null, error_message: error.message };
  }
}
