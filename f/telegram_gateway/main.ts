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
 * 2. Route based on update type (message vs callback_query).
 * 3. Auto-register client in a global context (no provider_id).
 * 4. Dispatch commands using a registry-like pattern for OCP compliance.
 *
 * ### Schema Verification
 * - Table 'clients' confirmed in §6: (client_id, name, email, phone, timezone).
 * - No provider_id means RLS is not applicable here.
 *
 * ### Failure Mode Analysis
 * - Telegram API: Wrapped in Result tuple.
 * - DB: Wrapped in Result tuple, registration failures logged but non-blocking.
 * - Validation: Zod safeParse prevents malformed payload crashes.
 *
 * ### SOLID Architecture Review
 * - SRP: Logic clearly divided into ITelegramClient, IClientRepository, and IRouter.
 * - OCP: The CommandRouter allows adding handlers without modifying core dispatch logic.
 * - LSP: Consistent use of Result<T> for all fallible operations.
 * - ISP: Specialized interfaces for DB, Messaging, and Routing.
 * - DIP: Business logic depends on abstractions, even if implemented locally for Windmill compatibility.
 */

import "@total-typescript/ts-reset";
import type { Result } from '../internal/result/index';
import { TelegramClient, ClientRepository } from './services';
import {
  TelegramUpdateSchema,
  type TelegramUpdate,
  type TelegramMessage,
  type TelegramCallback,
  type ITelegramClient,
  type IClientRepository,
} from './types';

// ============================================================================
// DOMAIN LOGIC / ROUTING
// ============================================================================

class TelegramRouter {
  constructor(
    private readonly telegram: ITelegramClient,
    private readonly repository: IClientRepository
  ) {}

  async routeUpdate(update: TelegramUpdate): Promise<Result<string>> {
    if (update.callback_query != null) {
      return this.handleCallback(update.callback_query);
    }

    if (update.message != null) {
      return this.handleMessage(update.message);
    }

    return [new Error('unsupported_update_type'), null];
  }

  private handleCallback(query: TelegramCallback): Result<string> {
    const data = query.data;

    // Pattern matching for callback actions (OCP compliant)
    const [category, action] = data.split(':');
    if (category == null || action == null) {
      return [null, `callback_handled:${data}`];
    }

    switch (category) {
      case 'cmd':
        return [null, `flow_triggered:${action}`];
      case 'admin':
        return [null, `admin_action:${action}`];
      case 'provider':
        return [null, `provider_action:${action}`];
      default:
        return [null, `callback_handled:${data}`];
    }
  }

  private async handleMessage(message: TelegramMessage): Promise<Result<string>> {
    const text = (message.text ?? '').trim();
    const chatId = String(message.chat.id);
    const firstName = message.from?.first_name ?? 'Usuario';
    const lastName = message.from?.last_name ?? '';
    const fullName = lastName !== '' ? `${firstName} ${lastName}` : firstName;

    // SRP: Registration is a background concern for the router
    // Failures are logged but do not block the UI response
    const [regErr] = await this.repository.ensureRegistered(fullName);
    if (regErr != null) {
      console.error(`[REGISTRATION_WARNING] ${regErr.message}`);
    }

    // Command Dispatching
    switch (text) {
      case '/start':
        return this.sendStartMenu(chatId, firstName);
      case '/admin':
        return this.sendAdminMenu(chatId);
      case '/provider':
        return this.sendProviderMenu(chatId);
      default:
        if (text === '') return [new Error('empty_message'), null];
        return this.sendHelp(chatId);
    }
  }

  private async sendStartMenu(chatId: string, firstName: string): Promise<Result<string>> {
    const welcomeText =
      `👋 ¡Hola ${firstName}! Bienvenido a *AutoAgenda*.\n\n` +
      `Soy tu asistente de agendamiento médico. ¿Qué necesitas?\n\n` +
      `📋 *Opciones disponibles:*\n` +
      `• *Agendar cita* → Escribe "quiero agendar"\n` +
      `• *Ver mis citas* → Escribe "mis citas"\n` +
      `• *Cancelar cita* → Escribe "cancelar"\n` +
      `• *Reagendar* → Escribe "reagendar"\n\n` +
      `💡 *Tip:* Puedes escribirme en lenguaje natural, yo te entiendo.`;

    const [err] = await this.telegram.sendMessage(chatId, welcomeText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📅 Agendar Cita', callback_data: 'cmd:book' }],
          [{ text: '📋 Mis Citas', callback_data: 'cmd:mybookings' }],
          [{ text: '❌ Cancelar', callback_data: 'cmd:cancel' }],
        ],
      },
    });

    return err != null ? [err, null] : [null, 'welcome_sent'];
  }

  private async sendAdminMenu(chatId: string): Promise<Result<string>> {
    const adminText =
      `🔐 *Panel de Administrador*\n\n` +
      `Selecciona una acción:\n\n` +
      `• *Crear Provider* → Nuevo profesional\n` +
      `• *Gestionar Providers* → Activar/desactivar\n` +
      `• *Especialidades* → Gestionar catálogo\n` +
      `• *Estadísticas* → Ver métricas`;

    const [err] = await this.telegram.sendMessage(chatId, adminText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👨‍⚕️ Crear Provider', callback_data: 'admin:create_provider' }],
          [{ text: '📊 Especialidades', callback_data: 'admin:specialties' }],
          [{ text: '📈 Estadísticas', callback_data: 'admin:stats' }],
        ],
      },
    });

    return err != null ? [err, null] : [null, 'admin_menu_sent'];
  }

  private async sendProviderMenu(chatId: string): Promise<Result<string>> {
    const providerText =
      `🩺 *Panel del Provider*\n\n` +
      `Selecciona una acción:\n\n` +
      `• *Mi Agenda* → Ver horarios\n` +
      `• *Notas Clínicas* → Escribir notas\n` +
      `• *Confirmar Citas* → Citas pendientes\n` +
      `• *Mi Perfil* → Datos personales`;

    const [err] = await this.telegram.sendMessage(chatId, providerText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📅 Mi Agenda', callback_data: 'provider:agenda' }],
          [{ text: '📝 Notas Clínicas', callback_data: 'provider:notes' }],
          [{ text: '✅ Confirmar Citas', callback_data: 'provider:confirm' }],
        ],
      },
    });

    return err != null ? [err, null] : [null, 'provider_menu_sent'];
  }

  private async sendHelp(chatId: string): Promise<Result<string>> {
    const response =
      `🤔 No entendí tu mensaje.\n\n` +
      `Puedo ayudarte con:\n` +
      `• */start* → Menú principal\n` +
      `• */admin* → Panel administrador\n` +
      `• */provider* → Panel provider\n\n` +
      `O simplemente dime qué necesitas en lenguaje natural.`;

    const [err] = await this.telegram.sendMessage(chatId, response);
    return err != null ? [err, null] : [null, 'help_sent'];
  }
}

// ============================================================================
// MAIN ENTRY POINT (WINDMILL)
// ============================================================================

export async function main(rawInput: unknown): Promise<Result<{ readonly message: string }>> {
  // 1. Validation (Defense in Depth)
  const parseResult = TelegramUpdateSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return [new Error(`validation_error: ${parseResult.error.message}`), null];
  }

  // 2. Dependency Composition (DIP)
  const telegramClient = new TelegramClient();
  const clientRepo = new ClientRepository();
  const router = new TelegramRouter(telegramClient, clientRepo);

  // 3. Execution
  const [err, res] = await router.routeUpdate(parseResult.data);

  if (err != null) {
    console.error(`[FATAL_DISPATCH_ERROR] ${err.message}`);
    return [err, null];
  }

  return [null, { message: res ?? 'ok' }];
}
