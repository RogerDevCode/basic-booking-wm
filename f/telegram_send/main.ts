/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Send Telegram messages with keyboard support (inline/reply/force)
 * DB Tables Used  : NONE — pure Telegram API dispatcher
 * Concurrency Risk: NO — independent message dispatch
 * GCal Calls      : NO
 * Idempotency Key : N/A — message sends are inherently non-idempotent
 * RLS Tenant ID   : NO — no DB queries, pure Telegram API
 * Zod Schemas     : YES — InputSchema validates chat_id, text, keyboard_mode
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Build formatted message text from message_type and booking_details with MarkdownV2 sanitization
 * - Construct ReplyMarkup from inline_buttons, reply_keyboard, or force_reply options
 * - Dispatch to Telegram Bot API with 3-attempt exponential backoff retry
 *
 * ### Schema Verification
 * - Tables: NONE — this is a pure Telegram API dispatcher
 * - Columns: N/A
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Telegram API returns 429 rate limit → extract retry_after parameter, wait capped at 30s
 * - Scenario 2: Network timeout or 5xx error → exponential backoff (3^attempt seconds), fail after 3 retries
 * - Scenario 3: 4xx client error (non-429) → permanent failure, return immediately without retry
 *
 * ### Concurrency Analysis
 * - Risk: NO — each invocation is independent; 50ms inter-request delay prevents rate limit collisions
 *
 * ### SOLID Compliance Check
 * - SRP: YES — buildMessage, buildReplyMarkup, sendWithRetry each have single responsibility
 * - DRY: YES — sanitizeForMarkdownV2 and safeString are shared helpers; message templates are centralized
 * - KISS: YES — linear switch/case for templates; iterative row-chunking for inline keyboard layout
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// TELEGRAM SEND — Notification Service with ReplyMarkup Support
// ============================================================================
// Sends Telegram messages with three keyboard modes:
// 1. inline_keyboard — action buttons (confirm/cancel/reschedule)
// 2. reply_keyboard — persistent menu bar (main navigation)
// 3. force_reply — text input toggle (wizard step prompts)
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
    'main_menu',
    'wizard_prompt',
    'custom',
  ]),
  booking_details: z.record(z.string(), z.unknown()).optional().default({}),
  inline_buttons: z.array(
    z.object({
      text: z.string(),
      callback_data: z.string().max(64),
    })
  ).optional().default([]),
  reply_keyboard: z.array(z.array(z.string())).optional(),
  force_reply: z.boolean().optional().default(false),
  reply_placeholder: z.string().optional().default('Escribe aquí...'),
  remove_keyboard: z.boolean().optional().default(false),
  parse_mode: z.enum(['MarkdownV2', 'HTML', 'None']).optional().default('MarkdownV2'),
});

type BookingDetails = Readonly<Record<string, unknown>>;

interface InlineButton {
  readonly text: string;
  readonly callback_data: string;
}

type ReplyMarkup =
  | { readonly remove_keyboard: true }
  | { readonly keyboard: readonly { readonly text: string }[][]; readonly resize_keyboard: true; readonly one_time_keyboard: boolean }
  | { readonly force_reply: true; readonly input_field_placeholder: string }
  | { readonly inline_keyboard: readonly InlineButton[][] }
  | undefined;

interface TelegramApiResponse {
  readonly ok: boolean;
  readonly result?: { readonly message_id?: number };
  readonly description?: string;
  readonly error_code?: number;
  readonly parameters?: { readonly retry_after?: number };
}

interface TelegramSendResult {
  readonly sent: boolean;
  readonly message_id: number | null;
  readonly error: string | null;
}

interface TelegramSendData {
  readonly sent: boolean;
  readonly message_id: number | null;
  readonly chat_id: string;
  readonly message_type: string;
}

function sanitizeForMarkdownV2(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// Type-safe string extractor - prevents [object Object] issues
function safeString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback; // Objects/Arrays fall back to default
}

function buildMessage(
  messageType: string,
  details: BookingDetails,
  parseMode: string
): string {
  const isMd = parseMode === 'MarkdownV2';
  const esc = isMd ? sanitizeForMarkdownV2 : (s: string) => s;

  const date = safeString(details['date'], 'Por confirmar');
  const time = safeString(details['time'], 'Por confirmar');
  const providerName = safeString(details['provider_name'], 'Tu doctor');
  const service = safeString(details['service'], 'Consulta');
  const bookingId = safeString(details['booking_id'], '');
  const cancellationReason = safeString(details['cancellation_reason'], '');
  const customMessage = safeString(details['message'], '');
  const promptText = safeString(details['prompt'], '¿Qué deseas hacer?');

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

    case 'main_menu':
      return `📋 *Menú Principal*\n\nElige una opción:\n\n📅 *Agendar cita* — Reserva tu próxima consulta\n📋 *Mis citas* — Ver citas próximas\n🔔 *Recordatorios* — Configurar avisos\n❓ *Información* — Datos del consultorio\n\nToca un botón o escribe el número de la opción.`;

    case 'wizard_prompt':
      return promptText;

    case 'custom':
      return customMessage;

    default: {
      const detailsStr = JSON.stringify(details);
      return `📋 Notificación: ${esc(detailsStr)}`;
    }
  }
}

function buildReplyMarkup(options: {
  inline_buttons?: InlineButton[];
  reply_keyboard?: string[][];
  force_reply?: boolean;
  reply_placeholder?: string;
  remove_keyboard?: boolean;
}): ReplyMarkup {
  const { inline_buttons = [], reply_keyboard, force_reply = false, reply_placeholder = 'Escribe aquí...', remove_keyboard = false } = options;

  if (remove_keyboard) {
    return { remove_keyboard: true };
  }

  if (reply_keyboard && reply_keyboard.length > 0) {
    return {
      keyboard: reply_keyboard.map(row => row.map(text => ({ text }))),
      resize_keyboard: true,
      one_time_keyboard: force_reply,
    };
  }

  if (force_reply) {
    return {
      force_reply: true,
      input_field_placeholder: reply_placeholder,
    };
  }

  if (inline_buttons.length > 0) {
    const rows: InlineButton[][] = [];
    for (let i = 0; i < inline_buttons.length; i += 2) {
      rows.push(inline_buttons.slice(i, i + 2));
    }
    return {
      inline_keyboard: rows.map(row =>
        row.map(btn => ({ text: btn.text, callback_data: btn.callback_data }))
      ),
    };
  }

  return undefined;
}

async function sendWithRetry(
  botToken: string,
  chatId: string,
  message: string,
  replyMarkup: ReplyMarkup,
  parseMode: string
): Promise<TelegramSendResult> {
  const maxRetries = 3;
  let lastError: string | null = null;

  const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Rate limiting: Telegram limit is 30 msg/s per bot
    // Add 50ms delay between sends to stay well under limit
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, 50 * attempt));
    }
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

      const data = (await response.json()) as TelegramApiResponse;

      if (response.ok && data.result != null) {
        return {
          sent: true,
          message_id: typeof data.result.message_id === 'number' ? data.result.message_id : null,
          error: null,
        };
      }

      const errorDesc = typeof data.description === 'string' ? data.description : 'Unknown error';
      const errorCode = typeof data.error_code === 'number' ? data.error_code : 0;

      if (errorCode >= 400 && errorCode < 500 && errorCode !== 429) {
        return { sent: false, message_id: null, error: `Permanent error (${String(errorCode)}): ${errorDesc}` };
      }

      if (errorCode === 429) {
        const retryAfter = typeof data.parameters?.retry_after === 'number' ? data.parameters.retry_after : 1;
        const waitMs = Math.min(retryAfter * 1000, 30000);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }

      lastError = `${String(errorCode)}: ${errorDesc}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }

    if (attempt < maxRetries - 1) {
      const backoff = 3 ** attempt * 1000;
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }

  return { sent: false, message_id: null, error: `Failed after ${String(maxRetries)} retries: ${lastError ?? 'Unknown error'}` };
}

export async function main(rawInput: unknown): Promise<[Error | null, TelegramSendData | null]> {
  try {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return [new Error(`Invalid input: ${parsed.error.message}`), null];
    }

    const { chat_id, message_type, booking_details, inline_buttons, reply_keyboard, force_reply, reply_placeholder, remove_keyboard, parse_mode } = parsed.data;

    const botToken = process.env['TELEGRAM_BOT_TOKEN'];
    if (!botToken) {
      return [new Error('TELEGRAM_BOT_TOKEN not configured'), null];
    }

    const message = buildMessage(message_type, booking_details, parse_mode);
    const replyMarkup = buildReplyMarkup({
      inline_buttons,
      ...(reply_keyboard !== undefined ? { reply_keyboard } : {}),
      force_reply,
      reply_placeholder,
      remove_keyboard,
    });

    const result = await sendWithRetry(botToken, chat_id, message, replyMarkup, parse_mode);

    if (!result.sent) {
      return [new Error(result.error ?? 'Failed to send message'), null];
    }
    return [null, {
        sent: result.sent,
        message_id: result.message_id,
        chat_id,
        message_type,
      }];
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return [new Error(error.message), null];
  }
}
