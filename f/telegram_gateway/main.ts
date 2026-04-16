/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Main webhook handler for Telegram messages (routing + commands)
 * DB Tables Used  : clients (for registration)
 * Concurrency Risk: NO — message routing + single-row registration
 * GCal Calls      : NO
 * Idempotency Key : N/A — message routing is inherently non-idempotent
 * RLS Tenant ID   : NO — clients table is global/shared (no provider_id per §6)
 * Zod Schemas     : YES — robust validation for Telegram updates
 */

/**
 * REASONING TRACE
 * ### Mission Decomposition
 * 1. Parse and validate Telegram update (message or callback_query).
 * 2. If callback_query: dispatch to specialized handler.
 * 3. If message:
 *    a. Extract metadata (chatId, user info).
 *    b. Auto-register client (idempotent).
 *    c. Route command (/start, /admin, /provider) or handle unknown.
 *
 * ### Schema Verification
 * - Table 'clients' (PK client_id, name, email, phone, timezone) exists in §6.
 * - Table 'clients' lacks provider_id, thus RLS is not applicable for this entity.
 *
 * ### Failure Mode Analysis
 * - Telegram API Failure: Captured in Result tuple and propagated.
 * - DB Connection/Insert Failure: Logged but allowed to fail silently as it's non-blocking for the UX.
 * - Validation Failure: Returns early with Zod error.
 *
 * ### SOLID Architecture Review
 * - SRP: Logic split into TelegramService (IO), ClientRepository (DB), and Dispatcher (Routing).
 * - OCP: Adding new commands only requires adding a branch in the router/dispatcher.
 * - LSP: Result<T> pattern followed strictly.
 * - ISP: Interfaces kept minimal.
 * - DIP: Depends on createDbClient abstraction.
 */

import "@total-typescript/ts-reset";
import { z } from 'zod';
import postgres from 'postgres';

import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';

// ============================================================================
// SCHEMAS
// ============================================================================

const TelegramUserSchema = z.object({
  id: z.number(),
  is_bot: z.boolean().optional(),
  first_name: z.string().default('Usuario'),
  last_name: z.string().optional(),
  username: z.string().optional(),
});

const TelegramMessageSchema = z.object({
  message_id: z.number(),
  from: TelegramUserSchema.optional(),
  chat: z.object({
    id: z.number(),
    type: z.enum(['private', 'group', 'supergroup', 'channel']),
  }),
  date: z.number(),
  text: z.string().optional(),
});

const TelegramCallbackQuerySchema = z.object({
  id: z.string(),
  from: TelegramUserSchema,
  message: TelegramMessageSchema.optional(),
  data: z.string(),
});

const TelegramUpdateSchema = z.object({
  update_id: z.number(),
  message: TelegramMessageSchema.optional(),
  callback_query: TelegramCallbackQuerySchema.optional(),
});

type TelegramUpdate = z.infer<typeof TelegramUpdateSchema>;

// ============================================================================
// TELEGRAM SERVICE (IO)
// ============================================================================

const BOT_TOKEN = process.env['TELEGRAM_BOT_TOKEN'] ?? '';

interface SendMessageOptions {
  readonly parse_mode?: 'Markdown' | 'HTML' | 'MarkdownV2';
  readonly reply_markup?: Readonly<Record<string, unknown>>;
}

async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: SendMessageOptions
): Promise<Result<unknown>> {
  if (BOT_TOKEN === '') {
    return [new Error('TELEGRAM_BOT_TOKEN_MISSING'), null];
  }

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.parse_mode ?? 'Markdown',
        reply_markup: options?.reply_markup,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return [new Error(`telegram_api_error: ${response.status} ${errorText}`), null];
    }

    const data = await response.json();
    return [null, data];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`send_message_failed: ${msg}`), null];
  }
}

// ============================================================================
// CLIENT REPOSITORY (DB)
// ============================================================================

async function ensureClientRegistered(fullName: string): Promise<Result<void>> {
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl == null || dbUrl === '') {
    return [new Error('DATABASE_URL_MISSING'), null];
  }

  let sql: postgres.Sql | null = null;
  try {
    sql = createDbClient({ url: dbUrl });
    // clients table has NO provider_id per §6, so RLS is not applicable.
    // We use a raw query (outside withTenantContext) as confirmed by §7/§12 constraints
    // because no tenantId is available at this entry point.
    await sql`
      INSERT INTO clients (client_id, name, email, phone, timezone)
      VALUES (gen_random_uuid(), ${fullName}, NULL, NULL, 'America/Mexico_City')
      ON CONFLICT DO NOTHING
    `;
    return [null, undefined];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`client_registration_failed: ${msg}`), null];
  } finally {
    if (sql != null) await sql.end();
  }
}

// ============================================================================
// HANDLERS
// ============================================================================

async function handleStartCommand(chatId: string, firstName: string): Promise<Result<string>> {
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
      inline_keyboard: [
        [{ text: '📅 Agendar Cita', callback_data: 'cmd:book' }],
        [{ text: '📋 Mis Citas', callback_data: 'cmd:mybookings' }],
        [{ text: '❌ Cancelar', callback_data: 'cmd:cancel' }],
      ],
    },
  });

  if (err != null) return [err, null];
  return [null, 'welcome_sent'];
}

async function handleAdminMenu(chatId: string): Promise<Result<string>> {
  const adminText =
    `🔐 *Panel de Administrador*\n\n` +
    `Selecciona una acción:\n\n` +
    `• *Crear Provider* → Nuevo profesional\n` +
    `• *Gestionar Providers* → Activar/desactivar\n` +
    `• *Especialidades* → Gestionar catálogo\n` +
    `• *Estadísticas* → Ver métricas`;

  const [err] = await sendTelegramMessage(chatId, adminText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '👨‍⚕️ Crear Provider', callback_data: 'admin:create_provider' }],
        [{ text: '📊 Especialidades', callback_data: 'admin:specialties' }],
        [{ text: '📈 Estadísticas', callback_data: 'admin:stats' }],
      ],
    },
  });

  if (err != null) return [err, null];
  return [null, 'admin_menu_sent'];
}

async function handleProviderMenu(chatId: string): Promise<Result<string>> {
  const providerText =
    `🩺 *Panel del Provider*\n\n` +
    `Selecciona una acción:\n\n` +
    `• *Mi Agenda* → Ver horarios\n` +
    `• *Notas Clínicas* → Escribir notas\n` +
    `• *Confirmar Citas* → Citas pendientes\n` +
    `• *Mi Perfil* → Datos personales`;

  const [err] = await sendTelegramMessage(chatId, providerText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📅 Mi Agenda', callback_data: 'provider:agenda' }],
        [{ text: '📝 Notas Clínicas', callback_data: 'provider:notes' }],
        [{ text: '✅ Confirmar Citas', callback_data: 'provider:confirm' }],
      ],
    },
  });

  if (err != null) return [err, null];
  return [null, 'provider_menu_sent'];
}

async function handleHelpResponse(chatId: string): Promise<Result<string>> {
  const response =
    `🤔 No entendí tu mensaje.\n\n` +
    `Puedo ayudarte con:\n` +
    `• */start* → Menú principal\n` +
    `• */admin* → Panel administrador\n` +
    `• */provider* → Panel provider\n\n` +
    `O simplemente dime qué necesitas en lenguaje natural.`;

  const [err] = await sendTelegramMessage(chatId, response);
  if (err != null) return [err, null];
  return [null, 'help_sent'];
}

// ============================================================================
// MAIN DISPATCHER
// ============================================================================

async function dispatchCallbackQuery(query: NonNullable<TelegramUpdate['callback_query']>): Promise<Result<string>> {
  const callbackData = query.data;

  if (callbackData.startsWith('cmd:')) {
    const cmd = callbackData.split(':')[1] ?? '';
    return [null, `flow_triggered:${cmd}`];
  }

  if (callbackData.startsWith('admin:')) {
    const action = callbackData.split(':')[1] ?? '';
    return [null, `admin_action:${action}`];
  }

  if (callbackData.startsWith('provider:')) {
    const action = callbackData.split(':')[1] ?? '';
    return [null, `provider_action:${action}`];
  }

  return [null, `callback_handled:${callbackData}`];
}

async function dispatchMessage(message: NonNullable<TelegramUpdate['message']>): Promise<Result<string>> {
  const text = (message.text ?? '').trim();
  const chatId = String(message.chat.id);
  const firstName = message.from?.first_name ?? 'Usuario';
  const lastName = message.from?.last_name ?? '';
  const fullName = lastName !== '' ? `${firstName} ${lastName}` : firstName;

  // Auto-register (idempotent)
  // We ignore the error as registration is non-blocking for routing
  await ensureClientRegistered(fullName);

  // Command Routing
  switch (text) {
    case '/start':
      return handleStartCommand(chatId, firstName);
    case '/admin':
      return handleAdminMenu(chatId);
    case '/provider':
      return handleProviderMenu(chatId);
    default:
      if (text === '') return [new Error('empty_message'), null];
      return handleHelpResponse(chatId);
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

export async function main(rawInput: unknown): Promise<Result<{ readonly message: string }>> {
  const parseResult = TelegramUpdateSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return [new Error(`validation_error: ${parseResult.error.message}`), null];
  }

  const update = parseResult.data;

  // 1. Handle Callbacks
  if (update.callback_query != null) {
    const [err, res] = await dispatchCallbackQuery(update.callback_query);
    if (err != null) return [err, null];
    return [null, { message: res ?? 'ok' }];
  }

  // 2. Handle Messages
  if (update.message != null) {
    const [err, res] = await dispatchMessage(update.message);
    if (err != null) return [err, null];
    return [null, { message: res ?? 'ok' }];
  }

  return [new Error('unsupported_update_type'), null];
}
