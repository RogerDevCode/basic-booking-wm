// ============================================================================
// TELEGRAM SEND — Notification Service with Inline Keyboard Support
// ============================================================================
// Sends Telegram messages with optional inline keyboard buttons for actions.
// Uses Telegram Bot API with retry (3 attempts, exponential backoff).
// ============================================================================

import { z } from 'zod';

const InputSchema = z.object({
  chat_id: z.string().min(1),
  message_type: z.enum([
    'booking_created',
    'booking_confirmed',
    'booking_cancelled',
    'booking_rescheduled',
    'reminder_24h',
    'reminder_2h',
    'reminder_30min',
    'no_show',
    'provider_schedule_change',
    'custom',
  ]),
  booking_details: z.record(z.string(), z.unknown()).optional().default({}),
  inline_buttons: z.array(
    z.object({
      text: z.string(),
      callback_data: z.string().max(64),
    })
  ).optional().default([]),
  parse_mode: z.enum(['MarkdownV2', 'HTML', 'None']).optional().default('MarkdownV2'),
});

type InlineButton = { text: string; callback_data: string };

function sanitizeForMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function buildMessage(
  messageType: string,
  details: Record<string, unknown>,
  parseMode: string
): string {
  const isMd = parseMode === 'MarkdownV2';
  const esc = isMd ? sanitizeForMarkdownV2 : (s: string) => s;

  const date = String(details['date'] ?? 'Por confirmar');
  const time = String(details['time'] ?? 'Por confirmar');
  const providerName = String(details['provider_name'] ?? 'Tu doctor');
  const service = String(details['service'] ?? 'Consulta');
  const bookingId = String(details['booking_id'] ?? '');
  const cancellationReason = details['cancellation_reason'] ? String(details['cancellation_reason']) : '';
  const customMessage = details['message'] ? String(details['message']) : '';

  switch (messageType) {
    case 'booking_created':
      return `✅ *Cita Agendada*\n\n📅 Fecha: ${esc(date)}\n🕐 Hora: ${esc(time)}\n👨‍⚕️ Doctor: ${esc(providerName)}\n📋 Servicio: ${esc(service)}${bookingId ? `\n\nID de cita: \`${bookingId}\`` : ''}`;

    case 'booking_confirmed':
      return `✅ *Cita Confirmada*\n\nTu cita ha sido confirmada:\n📅 ${esc(date)} a las 🕐 ${esc(time)}\n👨‍⚕️ ${esc(providerName)}\n📋 ${esc(service)}${bookingId ? `\n\nID: \`${bookingId}\`` : ''}`;

    case 'booking_cancelled':
      return `❌ *Cita Cancelada*\n\nTu cita ha sido cancelada:\n📅 ${esc(date)} a las 🕐 ${esc(time)}\n👨‍⚕️ ${esc(providerName)}${cancellationReason ? `\n\nMotivo: ${esc(cancellationReason)}` : ''}`;

    case 'booking_rescheduled':
      return `🔄 *Cita Reprogramada*\n\nTu cita ha sido reprogramada:\n📅 Nueva fecha: ${esc(date)}\n🕐 Nueva hora: ${esc(time)}\n👨‍⚕️ ${esc(providerName)}\n📋 ${esc(service)}${bookingId ? `\n\nID: \`${bookingId}\`` : ''}`;

    case 'reminder_24h':
      return `⏰ *Recordatorio de Cita*\n\nTu cita es *mañana*:\n📅 ${esc(date)} a las 🕐 ${esc(time)}\n👨‍⚕️ ${esc(providerName)}\n📋 ${esc(service)}${bookingId ? `\n\nID: \`${bookingId}\`` : ''}\n\nPara cancelar, responde: /cancelar ${bookingId}`;

    case 'reminder_2h':
      return `⏰ *Tu cita es pronto*\n\nTu cita es en *2 horas*:\n📅 ${esc(date)} a las 🕐 ${esc(time)}\n👨‍⚕️ ${esc(providerName)}\n\n¡No olvides llegar 10 minutos antes!`;

    case 'reminder_30min':
      return `🚨 *Tu cita es en 30 minutos*\n\n📅 ${esc(date)} a las 🕐 ${esc(time)}\n👨‍⚕️ ${esc(providerName)}\n\n¡Es hora de salir!`;

    case 'no_show':
      return `⚠️ *Política de Inasistencia*\n\nNo asististe a tu cita del ${esc(date)} a las ${esc(time)}.\n\nRecuerda: Las cancelaciones deben hacerse con al menos 24 horas de anticipación.`;

    case 'provider_schedule_change':
      return `📢 *Cambio de Horario*\n\nEl horario de ${esc(providerName)} ha cambiado.\nSi tienes citas próximas, te contactaremos para reprogramar.`;

    case 'custom':
      return customMessage;

    default:
      return `📋 Notificación: ${esc(JSON.stringify(details))}`;
  }
}

function buildInlineKeyboard(buttons: InlineButton[]): Record<string, unknown> | undefined {
  if (buttons.length === 0) return undefined;

  const rows: InlineButton[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  return {
    inline_keyboard: rows.map(row =>
      row.map(btn => ({
        text: btn.text,
        callback_data: btn.callback_data,
      }))
    ),
  };
}

async function sendWithRetry(
  botToken: string,
  chatId: string,
  message: string,
  replyMarkup: Record<string, unknown> | undefined,
  parseMode: string
): Promise<{ sent: boolean; message_id: number | null; error: string | null }> {
  const maxRetries = 3;
  let lastError: string | null = null;

  const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const body: Record<string, unknown> = {
        chat_id: chatId,
        text: message,
        parse_mode: parseMode === 'None' ? undefined : parseMode,
      };

      if (replyMarkup) {
        body['reply_markup'] = JSON.stringify(replyMarkup);
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });

      const data = await response.json() as Record<string, unknown>;

      if (response.ok && typeof data === 'object' && data !== null && 'result' in data) {
        const result = data['result'] as Record<string, unknown>;
        return {
          sent: true,
          message_id: typeof result?.['message_id'] === 'number' ? result['message_id'] : null,
          error: null,
        };
      }

      const errorDesc = typeof data?.['description'] === 'string' ? data['description'] : 'Unknown error';
      const errorCode = typeof data?.['error_code'] === 'number' ? data['error_code'] : 0;

      if (errorCode >= 400 && errorCode < 500 && errorCode !== 429) {
        return { sent: false, message_id: null, error: `Permanent error (${errorCode}): ${errorDesc}` };
      }

      lastError = `${errorCode}: ${errorDesc}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }

    if (attempt < maxRetries - 1) {
      const backoff = Math.pow(3, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }

  return { sent: false, message_id: null, error: `Failed after ${maxRetries} retries: ${lastError}` };
}

export async function main(rawInput: unknown): Promise<{ success: boolean; data: unknown | null; error_message: string | null }> {
  try {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, data: null, error_message: `Invalid input: ${parsed.error.message}` };
    }

    const { chat_id, message_type, booking_details, inline_buttons, parse_mode } = parsed.data;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return { success: false, data: null, error_message: 'TELEGRAM_BOT_TOKEN not configured' };
    }

    const message = buildMessage(message_type, booking_details, parse_mode);
    const replyMarkup = buildInlineKeyboard(inline_buttons);

    const result = await sendWithRetry(botToken, chat_id, message, replyMarkup, parse_mode);

    return {
      success: result.sent,
      data: {
        sent: result.sent,
        message_id: result.message_id,
        chat_id,
        message_type,
      },
      error_message: result.error,
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { success: false, data: null, error_message: error.message };
  }
}
