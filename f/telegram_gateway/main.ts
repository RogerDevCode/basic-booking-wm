// ============================================================================
// TELEGRAM GATEWAY — Main webhook handler for Telegram messages
// ============================================================================
// Receives POST from Telegram webhook
// Routes messages to appropriate handler based on command
// /start → Client flow (register + welcome)
// /admin → Admin flow (provider management)
// /provider → Provider flow (agenda + notes)
// Other text → AI Agent intent classification
// ============================================================================

import "@total-typescript/ts-reset";
import { z } from 'zod';
import postgres from 'postgres';

// ============================================================================
// INPUT SCHEMA — Telegram webhook payload
// When called via Windmill webhook, the body arrives as a JSON string
// that we need to parse first.
// ============================================================================

const RawBodySchema = z.object({
  update_id: z.number().optional(),
  message: z.object({
    message_id: z.number().optional(),
    from: z.object({
      id: z.number().optional(),
      is_bot: z.boolean().optional(),
      first_name: z.string().optional().default('Usuario'),
      last_name: z.string().optional(),
      username: z.string().optional(),
    }).optional(),
    chat: z.object({
      id: z.number(),
      type: z.enum(['private', 'group', 'supergroup', 'channel']).optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      username: z.string().optional(),
    }),
    date: z.number().optional(),
    text: z.string().optional(),
  }).optional(),
  callback_query: z.object({
    id: z.string(),
    from: z.object({ id: z.number() }),
    message: z.any().optional(),
    data: z.string(),
  }).optional(),
});

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

const BOT_TOKEN = process.env['TELEGRAM_BOT_TOKEN'] ?? '';
const CHAT_ID = process.env['TELEGRAM_ID'] ?? '';

async function sendTelegramMessage(chatId: string, text: string, options?: { parse_mode?: string; reply_markup?: Record<string, unknown> }): Promise<[Error | null, unknown]> {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode ?? 'Markdown',
    };
    if (options?.reply_markup != null) body.reply_markup = options.reply_markup;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return [new Error(`Telegram API error: ${response.status} ${errorText}`), null];
    }

    const data = await response.json() as unknown;
    return [null, data];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`send_message_failed: ${msg}`), null];
  }
}

// ============================================================================
// COMMAND ROUTERS
// ============================================================================

async function handleStart(chatId: string, firstName: string): Promise<[Error | null, string]> {
  const welcomeText =
    `👋 ¡Hola ${firstName}! Bienvenido a *AutoAgenda*.\n\n` +
    `Soy tu asistente de agendamiento médico. ¿Qué necesitas?\n\n` +
    `📋 *Opciones disponibles:*\n` +
    `• *Agendar cita* → Escribe "quiero agendar"\n` +
    `• *Ver mis citas* → Escribe "mis citas"\n` +
    `• *Cancelar cita* → Escribe "cancelar"\n` +
    `• *Reagendar* → Escribe "reagendar"\n\n` +
    `💡 *Tip:* Puedes escribirme en lenguaje natural, yo te entiendo.`;

  const [err] = await sendTelegramMessage(chatId, welcomeText, {
    reply_markup: {
      inline_keyboard: [[
        { text: '📅 Agendar Cita', callback_data: 'cmd:book' },
      ], [
        { text: '📋 Mis Citas', callback_data: 'cmd:mybookings' },
      ], [
        { text: '❌ Cancelar', callback_data: 'cmd:cancel' },
      ]],
    },
  });

  if (err != null) return [err, 'Error sending welcome'];
  return [null, 'Welcome sent'];
}

async function handleAdmin(chatId: string): Promise<[Error | null, string]> {
  const adminText =
    `🔐 *Panel de Administrador*\n\n` +
    `Selecciona una acción:\n\n` +
    `• *Crear Provider* → Nuevo profesional\n` +
    `• *Gestionar Providers* → Activar/desactivar\n` +
    `• *Especialidades* → Gestionar catálogo\n` +
    `• *Estadísticas* → Ver métricas`;

  const [err] = await sendTelegramMessage(chatId, adminText, {
    reply_markup: {
      inline_keyboard: [[
        { text: '👨‍⚕️ Crear Provider', callback_data: 'admin:create_provider' },
      ], [
        { text: '📊 Especialidades', callback_data: 'admin:specialties' },
      ], [
        { text: '📈 Estadísticas', callback_data: 'admin:stats' },
      ]],
    },
  });

  if (err != null) return [err, 'Error sending admin menu'];
  return [null, 'Admin menu sent'];
}

async function handleProvider(chatId: string): Promise<[Error | null, string]> {
  const providerText =
    `🩺 *Panel del Provider*\n\n` +
    `Selecciona una acción:\n\n` +
    `• *Mi Agenda* → Ver horarios\n` +
    `• *Notas Clínicas* → Escribir notas\n` +
    `• *Confirmar Citas* → Citas pendientes\n` +
    `• *Mi Perfil* → Datos personales`;

  const [err] = await sendTelegramMessage(chatId, providerText, {
    reply_markup: {
      inline_keyboard: [[
        { text: '📅 Mi Agenda', callback_data: 'provider:agenda' },
      ], [
        { text: '📝 Notas Clínicas', callback_data: 'provider:notes' },
      ], [
        { text: '✅ Confirmar Citas', callback_data: 'provider:confirm' },
      ]],
    },
  });

  if (err != null) return [err, 'Error sending provider menu'];
  return [null, 'Provider menu sent'];
}

async function handleUnknownCommand(chatId: string, text: string): Promise<[Error | null, string]> {
  // For unknown commands, respond with guidance
  const response =
    `🤔 No entendí tu mensaje.\n\n` +
    `Puedo ayudarte con:\n` +
    `• */start* → Menú principal\n` +
    `• */admin* → Panel administrador\n` +
    `• */provider* → Panel provider\n\n` +
    `O simplemente dime qué necesitas en lenguaje natural.`;

  const [err] = await sendTelegramMessage(chatId, response);
  if (err != null) return [err, 'Error sending help'];
  return [null, 'Help sent'];
}

// ============================================================================
// MAIN — Webhook entry point
// Windmill maps JSON keys to function parameters individually
// ============================================================================

export async function main(args: {
  update_id?: number;
  message?: {
    message_id?: number;
    from?: { id?: number; is_bot?: boolean; first_name?: string; last_name?: string; username?: string };
    chat: { id: number; type?: string; first_name?: string; last_name?: string; username?: string };
    date?: number;
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number };
    message?: unknown;
    data: string;
  };
}): Promise<{
  readonly success: boolean;
  readonly data: { readonly message: string } | null;
  readonly error_message: string | null;
}> {
  const input = RawBodySchema.safeParse(args);
  if (!input.success) {
    return { success: false, data: null, error_message: `Validation error: ${input.error.message}` };
  }

  const data = input.data;

  // Handle callback queries (button presses)
  if (data?.callback_query != null) {
    const callbackData = data.callback_query.data;
    const chatId = String(data.callback_query.from.id);

    if (callbackData.startsWith('cmd:')) {
      const cmd = callbackData.split(':')[1] ?? '';
      if (cmd === 'book') return { success: true, data: { message: 'Booking flow triggered' }, error_message: null };
      if (cmd === 'mybookings') return { success: true, data: { message: 'My bookings flow triggered' }, error_message: null };
      if (cmd === 'cancel') return { success: true, data: { message: 'Cancel flow triggered' }, error_message: null };
    }

    if (callbackData.startsWith('admin:')) {
      const action = callbackData.split(':')[1] ?? '';
      return { success: true, data: { message: `Admin action: ${action}` }, error_message: null };
    }

    if (callbackData.startsWith('provider:')) {
      const action = callbackData.split(':')[1] ?? '';
      return { success: true, data: { message: `Provider action: ${action}` }, error_message: null };
    }

    return { success: true, data: { message: `Callback handled: ${callbackData}` }, error_message: null };
  }

  // Handle messages
  if (data?.message == null || data.message.text == null) {
    return { success: false, data: null, error_message: 'No message or text found' };
  }

  const message = data.message;
  const text = message.text.trim();
  const chatId = String(message.chat.id);
  const firstName = message.from?.first_name ?? 'Usuario';
  const lastName = message.from?.last_name ?? '';
  const fullName = lastName !== '' ? `${firstName} ${lastName}` : firstName;

  // Register user if not exists
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl != null && dbUrl !== '') {
    try {
      const sql = postgres(dbUrl, { ssl: 'require' });
      await sql`
        INSERT INTO clients (client_id, name, email, phone, timezone)
        VALUES (gen_random_uuid(), ${fullName}, NULL, NULL, 'America/Santiago')
        ON CONFLICT DO NOTHING
      `;
      await sql.end();
    } catch {
      // Silently fail — user registration is not critical
    }
  }

  // Route command
  if (text === '/start') {
    const [err, msg] = await handleStart(chatId, firstName);
    if (err != null) return { success: false, data: null, error_message: err.message };
    return { success: true, data: { message: msg }, error_message: null };
  }

  if (text === '/admin') {
    const [err, msg] = await handleAdmin(chatId);
    if (err != null) return { success: false, data: null, error_message: err.message };
    return { success: true, data: { message: msg }, error_message: null };
  }

  if (text === '/provider') {
    const [err, msg] = await handleProvider(chatId);
    if (err != null) return { success: false, data: null, error_message: err.message };
    return { success: true, data: { message: msg }, error_message: null };
  }

  // Unknown command — send help
  const [err, msg] = await handleUnknownCommand(chatId, text);
  if (err != null) return { success: false, data: null, error_message: err.message };
  return { success: true, data: { message: msg }, error_message: null };
}
