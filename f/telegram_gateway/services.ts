/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Implementations of Telegram client and repository interfaces
 * DB Tables Used  : clients
 * Concurrency Risk: NO — single-row registration per user
 * GCal Calls      : NO
 * Idempotency Key : N/A (message routing is non-idempotent)
 * RLS Tenant ID   : NO — clients table is global (no provider_id)
 * Zod Schemas     : NO (validation in main)
 */

import postgres from 'postgres';
import type { Result } from '../internal/result/index';
import { createDbClient } from '../internal/db/client';
import type { ITelegramClient, IClientRepository, SendMessageOptions } from './types';

/**
 * Handles communication with Telegram Bot API
 */
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
        return [new Error(`telegram_api_error: ${String(response.status)} ${errorText}`), null];
      }

      const data = await response.json();
      return [null, data];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return [new Error(`send_message_failed: ${msg}`), null];
    }
  }
}

/**
 * Handles Client persistence (Global context, no RLS per §6)
 */
export class ClientRepository implements IClientRepository {
  private readonly dbUrl: string;

  constructor() {
    this.dbUrl = process.env['DATABASE_URL'] ?? '';
  }

  async ensureRegistered(fullName: string): Promise<Result<void>> {
    if (this.dbUrl === '') {
      return [new Error('DATABASE_URL_MISSING'), null];
    }

    let sql: postgres.Sql | null = null;
    try {
      sql = createDbClient({ url: this.dbUrl });
      await sql`
        INSERT INTO clients (client_id, name, email, phone, timezone)
        VALUES (gen_random_uuid(), ${fullName}, NULL, NULL, 'America/Mexico_City')
        ON CONFLICT (email) DO NOTHING
      `;
      // Note: ON CONFLICT DO NOTHING relies on email being UNIQUE per §6.
      // If client_id was the only unique field, we would need a different strategy.
      return [null, undefined];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return [new Error(`client_registration_failed: ${msg}`), null];
    } finally {
      if (sql != null) await sql.end();
    }
  }
}
