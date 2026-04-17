import postgres from 'postgres';
import type { Result } from '../internal/result';
import type { ITelegramClient, IClientRepository, SendMessageOptions, TelegramUpdate, TelegramMessage, TelegramCallback } from './types';

export class TelegramClient implements ITelegramClient {
  private readonly token: string;

  constructor() {
    this.token = process.env['TELEGRAM_BOT_TOKEN'] ?? '';
  }

  async sendMessage(chatId: string, text: string, options?: SendMessageOptions): Promise<Result<unknown>> {
    if (this.token === '') {
      return [new Error('TELEGRAM_BOT_TOKEN_MISSING'), null];
    }

    try {
      const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
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
        return [new Error(`telegram_api_error: ${response.status.toString()} ${errorText}`), null];
      }

      const data = await response.json();
      return [null, data];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return [new Error(`send_message_failed: ${msg}`), null];
    }
  }
}

export class ClientRepository implements IClientRepository {
  private readonly dbUrl: string;

  constructor() {
    this.dbUrl = process.env['DATABASE_URL'] ?? '';
  }

  async ensureRegistered(fullName: string): Promise<Result<void>> {
    if (this.dbUrl === '') {
      return [new Error('DATABASE_URL_MISSING'), null];
    }

    const sql = postgres(this.dbUrl);
    try {
      const chatId = fullName;
      const existing = await sql`
        SELECT client_id FROM clients WHERE telegram_chat_id = ${chatId} LIMIT 1
      `;

      if (existing.length > 0) {
        return [null, undefined];
      }

      await sql`
        INSERT INTO clients (name, telegram_chat_id)
        VALUES (${fullName}, ${chatId})
        ON CONFLICT DO NOTHING
      `;

      return [null, undefined];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return [new Error(`registration_failed: ${msg}`), null];
    } finally {
      await sql.end();
    }
  }
}

export class TelegramRouter {
  private readonly telegram: ITelegramClient;
  private readonly clientRepo: IClientRepository;

  constructor(telegram: ITelegramClient, clientRepo: IClientRepository) {
    this.telegram = telegram;
    this.clientRepo = clientRepo;
  }

  async routeUpdate(update: TelegramUpdate): Promise<Result<string>> {
    if (update.callback_query) {
      return this.handleCallback(update.callback_query);
    }
    if (update.message) {
      return this.handleMessage(update.message);
    }
    return [null, 'noop'];
  }

  private async handleMessage(message: TelegramMessage): Promise<Result<string>> {
    const chatId = String(message.chat.id);
    const text = message.text ?? '';
    const user = message.from;

    if (text === '/start') {
      return this.sendMainMenu(chatId);
    }

    if (text.startsWith('/')) {
      const cmd = text.slice(1).toLowerCase();
      if (cmd === 'admin') return this.sendAdminMenu(chatId);
      if (cmd === 'provider') return this.sendProviderMenu(chatId);
    }

    const isClientFlow = user?.username?.startsWith('client_') ?? false;
    if (isClientFlow) {
      const [regErr] = await this.clientRepo.ensureRegistered(user?.first_name ?? 'Unknown');
      if (regErr != null) {
        console.error(`[CLIENT_REG_FAILED] ${regErr.message}`);
      }
      return this.sendClientMenu(chatId);
    }

    return this.sendHelp(chatId);
  }

  private handleCallback(callback: TelegramCallback): Result<string> {
    const chatId = String(callback.message?.chat.id ?? '');
    const data = callback.data;

    if (data.startsWith('client:')) {
      return this.handleClientCallback(chatId, data);
    }
    if (data.startsWith('admin:')) {
      return this.handleAdminCallback(chatId, data);
    }
    if (data.startsWith('provider:')) {
      return this.handleProviderCallback(chatId, data);
    }

    return [null, 'callback_processed'];
  }

  private handleClientCallback(_chatId: string, data: string): Result<string> {
    const action = data.split(':')[1] ?? '';
    if (action === 'book') return [null, 'book_init'];
    if (action === 'mybookings') return [null, 'mybooks_init'];
    return [null, 'client_callback_done'];
  }

  private handleAdminCallback(_chatId: string, data: string): Result<string> {
    const action = data.split(':')[1] ?? '';
    if (action === 'create_provider') return [null, 'admin_create_provider'];
    if (action === 'specialties') return [null, 'admin_specialties'];
    return [null, 'admin_callback_done'];
  }

  private handleProviderCallback(_chatId: string, data: string): Result<string> {
    const action = data.split(':')[1] ?? '';
    if (action === 'agenda') return [null, 'provider_agenda'];
    if (action === 'notes') return [null, 'provider_notes'];
    return [null, 'provider_callback_done'];
  }

  private async sendMainMenu(chatId: string): Promise<Result<string>> {
    const mainText = `🏥 *Windmill Medical Booking*\n\nBienvenido. ¿En qué puedo ayudarte?`;
    const [err] = await this.telegram.sendMessage(chatId, mainText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📅 Agendar Cita', callback_data: 'client:book' }],
          [{ text: '📋 Mis Citas', callback_data: 'client:mybookings' }],
        ],
      },
    });
    return err != null ? [err, null] : [null, 'main_menu_sent'];
  }

  private async sendClientMenu(chatId: string): Promise<Result<string>> {
    const clientText = `👤 *Menú del Cliente*\n\nSelecciona una acción:\n• *Agendar Cita* → Reservar turno\n• *Mis Citas* → Ver reservas\n• *Cancelar* → Cancelar reserva`;
    const [err] = await this.telegram.sendMessage(chatId, clientText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📅 Agendar', callback_data: 'client:book' }],
          [{ text: '📋 Mis Citas', callback_data: 'client:mybookings' }],
        ],
      },
    });
    return err != null ? [err, null] : [null, 'client_menu_sent'];
  }

  private async sendAdminMenu(chatId: string): Promise<Result<string>> {
    const adminText = `⚙️ *Panel de Admin*\n\nSelecciona una acción:\n• *Crear Provider* → Nuevo profesional\n• *Gestionar Providers* → Activar/desactivar\n• *Especialidades* → Gestionar catálogo\n• *Estadísticas* → Ver métricas`;
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
    const providerText = `🩺 *Panel del Provider*\n\nSelecciona una acción:\n• *Mi Agenda* → Ver horarios\n• *Notas Clínicas* → Escribir notas\n• *Confirmar Citas* → Citas pendientes\n• *Mi Perfil* → Datos personales`;
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
    const response = `🤔 No entendí tu mensaje.\n\nPuedo ayudarte con:\n• */start* → Menú principal\n• */admin* → Panel administrador\n• */provider* → Panel provider\n\nO simplemente dime qué necesitas en lenguaje natural.`;
    const [err] = await this.telegram.sendMessage(chatId, response);
    return err != null ? [err, null] : [null, 'help_sent'];
  }
}