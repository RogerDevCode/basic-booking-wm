// ============================================================================
// TELEGRAM CALLBACK HANDLER — Inline Button Action Processor
// ============================================================================
// Handles callback queries from Telegram inline keyboard buttons.
// Supports actions: confirm, cancel, reschedule, activate_reminders, deactivate_reminders.
// Callback data format: "act:BID" where act=action (1-3 chars), BID=booking_id (up to 60 chars)
// ============================================================================

import { z } from 'zod';
import * as postgres from 'postgres';
import type { Sql } from 'postgres';

const InputSchema = z.object({
  callback_query_id: z.string().min(1),
  callback_data: z.string().min(1).max(64),
  chat_id: z.string().min(1),
  message_id: z.string().optional(),
  user_id: z.string().optional(),
});

const ACTION_MAP: Record<string, string> = {
  'cnf': 'confirm',
  'cxl': 'cancel',
  'res': 'reschedule',
  'act': 'activate_reminders',
  'dea': 'deactivate_reminders',
  'ack': 'acknowledge',
};

function parseCallbackData(data: string): { action: string; booking_id: string } | null {
  const parts = data.split(':');
  if (parts.length !== 2) return null;

  const actionCode = parts[0];
  const bookingId = parts[1];

  const action = ACTION_MAP[actionCode];
  if (!action) return null;

  return { action, booking_id: bookingId };
}

async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text: string,
  showAlert = false
): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      }),
      signal: AbortSignal.timeout(5000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function sendFollowUpMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'MarkdownV2',
      }),
      signal: AbortSignal.timeout(10000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function updateBookingStatus(
  sql: postgres.Sql,
  bookingId: string,
  newStatus: string,
  patientId: string | undefined,
  actor: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const [booking] = await sql`
      SELECT booking_id, status, patient_id, start_time, end_time
      FROM bookings
      WHERE booking_id = ${bookingId}::uuid
        AND status NOT IN ('cancelled', 'completed', 'no_show', 'rescheduled')
      LIMIT 1
    `;

    if (!booking) {
      return { success: false, error: 'Booking not found or already terminal' };
    }

    if (patientId && booking.patient_id !== patientId) {
      return { success: false, error: 'Unauthorized: patient mismatch' };
    }

    await sql`
      UPDATE bookings
      SET status = ${newStatus},
          cancelled_by = ${newStatus === 'cancelled' ? actor : null},
          updated_at = NOW()
      WHERE booking_id = ${bookingId}::uuid
    `;

    await sql`
      INSERT INTO booking_audit (booking_id, from_status, to_status, changed_by, actor_id, reason)
      VALUES (${bookingId}::uuid, ${booking['status']}, ${newStatus}, ${actor}, 
              ${patientId ? patientId : null}, 
              ${newStatus === 'cancelled' ? 'Cancelled via Telegram inline button' : 'Status updated via Telegram'})
    `;

    return { success: true, error: null };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { success: false, error: err.message };
  }
}

async function updateReminderPreferences(
  sql: postgres.Sql,
  patientId: string,
  activate: boolean
): Promise<{ success: boolean; error: string | null }> {
  try {
    const defaults = activate
      ? '{"telegram_24h": true, "gmail_24h": true, "telegram_2h": true, "telegram_30min": true}'
      : '{"telegram_24h": false, "gmail_24h": false, "telegram_2h": false, "telegram_30min": false}';

    await sql`
      UPDATE patients
      SET reminder_preferences = ${defaults}::jsonb,
          updated_at = NOW()
      WHERE patient_id = ${patientId}::uuid
    `;

    return { success: true, error: null };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { success: false, error: err.message };
  }
}

export async function main(rawInput: unknown): Promise<{ success: boolean; data: unknown | null; error_message: string | null }> {
  try {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, data: null, error_message: `Invalid input: ${parsed.error.message}` };
    }

    const { callback_query_id, callback_data, chat_id } = parsed.data;

    const botToken = process.env['TELEGRAM_BOT_TOKEN'];
    if (!botToken) {
      return { success: false, data: null, error_message: 'TELEGRAM_BOT_TOKEN not configured' };
    }

    const parsedCallback = parseCallbackData(callback_data);
    if (!parsedCallback) {
      await answerCallbackQuery(botToken, callback_query_id, '⚠️ Acción no reconocida');
      return { success: false, data: null, error_message: `Invalid callback data format: ${callback_data}` };
    }

    const { action, booking_id } = parsedCallback;

    let responseText = '';
    let followUpText: string | null = null;

    switch (action) {
      case 'cancel': {
        const dbUrl = process.env['DATABASE_URL'];
        if (!dbUrl) {
          await answerCallbackQuery(botToken, callback_query_id, '❌ Error de configuración');
          return { success: false, data: null, error_message: 'DATABASE_URL not configured' };
        }

        const sql = postgres(dbUrl, { ssl: 'require' });
        const result = await updateBookingStatus(sql, booking_id, 'cancelled', undefined, 'patient');
        await sql.end();

        if (result.success) {
          responseText = '✅ Cita cancelada';
          followUpText = 'Tu cita ha sido cancelada exitosamente\\. Si deseas reagendar, escribe "quiero agendar una cita"\\.';
        } else {
          responseText = '❌ No se pudo cancelar';
          followUpText = `No pudimos cancelar tu cita\\. Motivo: ${result.error?.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1') ?? 'Desconocido'}\\. Contacta a soporte si necesitas ayuda\\.`;
        }
        break;
      }

      case 'confirm': {
        responseText = '✅ Cita confirmada';
        followUpText = 'Tu cita ha sido confirmada\\. ¡Te esperamos\\!';
        break;
      }

      case 'reschedule': {
        responseText = '🔄 Reprogramar cita';
        followUpText = 'Para reprogramar tu cita, responde con la fecha y hora que prefieres\\. Ejemplo: "Quiero el lunes a las 10am"\\.';
        break;
      }

      case 'activate_reminders': {
        const dbUrl = process.env['DATABASE_URL'];
        if (!dbUrl) {
          await answerCallbackQuery(botToken, callback_query_id, '❌ Error de configuración');
          return { success: false, data: null, error_message: 'DATABASE_URL not configured' };
        }

        const patientId = process.env['PATIENT_ID'];
        if (!patientId) {
          await answerCallbackQuery(botToken, callback_query_id, '❌ Paciente no identificado');
          return { success: false, data: null, error_message: 'PATIENT_ID not available' };
        }

        const sql = postgres(dbUrl, { ssl: 'require' });
        const result = await updateReminderPreferences(sql, patientId, true);
        await sql.end();

        if (result.success) {
          responseText = '🔔 Recordatorios activados';
          followUpText = 'Tus recordatorios han sido activados\\. Recibirás avisos a 24h, 2h y 30min antes de tus citas\\.';
        } else {
          responseText = '❌ Error al activar';
          followUpText = 'No pudimos activar tus recordatorios\\. Intenta de nuevo más tarde\\.';
        }
        break;
      }

      case 'deactivate_reminders': {
        const dbUrl = process.env['DATABASE_URL'];
        if (!dbUrl) {
          await answerCallbackQuery(botToken, callback_query_id, '❌ Error de configuración');
          return { success: false, data: null, error_message: 'DATABASE_URL not configured' };
        }

        const patientId = process.env['PATIENT_ID'];
        if (!patientId) {
          await answerCallbackQuery(botToken, callback_query_id, '❌ Paciente no identificado');
          return { success: false, data: null, error_message: 'PATIENT_ID not available' };
        }

        const sql = postgres(dbUrl, { ssl: 'require' });
        const result = await updateReminderPreferences(sql, patientId, false);
        await sql.end();

        if (result.success) {
          responseText = '🔕 Recordatorios desactivados';
          followUpText = 'Tus recordatorios han sido desactivados\\. No recibirás avisos automáticos\\.';
        } else {
          responseText = '❌ Error al desactivar';
          followUpText = 'No pudimos desactivar tus recordatorios\\. Intenta de nuevo más tarde\\.';
        }
        break;
      }

      case 'acknowledge': {
        responseText = '✅ Recibido';
        break;
      }

      default:
        responseText = '⚠️ Acción no reconocida';
    }

    await answerCallbackQuery(botToken, callback_query_id, responseText);

    if (followUpText) {
      await sendFollowUpMessage(botToken, chat_id, followUpText);
    }

    return {
      success: true,
      data: {
        action,
        booking_id,
        callback_query_id,
        response_text: responseText,
      },
      error_message: null,
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { success: false, data: null, error_message: error.message };
  }
}
