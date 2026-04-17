import postgres from 'postgres';
import { z } from 'zod';

export type SqlClient = postgres.Sql | postgres.TransactionSql;
export type ReminderPrefs = {
      telegram_24h: boolean;
      gmail_24h: boolean;
      telegram_2h: boolean;
      telegram_30min: boolean;
    };

export interface ClientMetadataRow {
    readonly metadata: Readonly<Record<string, unknown>> | null;
}

export interface ReminderConfigResult {
    readonly message: string;
    readonly reply_keyboard: string[][] | undefined;
    readonly preferences: ReminderPrefs;
}

export const InputSchema = z.object({
      action: z.enum(['show', 'toggle_channel', 'toggle_window', 'deactivate_all', 'activate_all', 'back']),
      client_id: z.string().optional(),
      channel: z.string().optional(),
      window: z.string().optional(),
    });
