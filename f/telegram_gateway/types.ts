/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Type definitions and schemas for Telegram webhook integration
 * DB Tables Used  : None (types only)
 * Concurrency Risk: NO
 * GCal Calls      : NO
 * Idempotency Key : N/A
 * RLS Tenant ID   : NO
 * Zod Schemas     : YES — Telegram update validation
 */

import { z } from 'zod';
import type { Result } from '../internal/result';

// ============================================================================
// TELEGRAM SCHEMAS (Input Validation)
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

// ============================================================================
// INFERRED TYPES
// ============================================================================

export type TelegramUpdate = z.infer<typeof TelegramUpdateSchema>;
export type TelegramMessage = NonNullable<TelegramUpdate['message']>;
export type TelegramCallback = NonNullable<TelegramUpdate['callback_query']>;

export interface SendMessageOptions {
  readonly parse_mode?: 'Markdown' | 'HTML' | 'MarkdownV2';
  readonly reply_markup?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// SERVICE ABSTRACTIONS
// ============================================================================

export interface ITelegramClient {
  sendMessage(chatId: string, text: string, options?: SendMessageOptions): Promise<Result<unknown>>;
}

export interface IClientRepository {
  ensureRegistered(fullName: string): Promise<Result<void>>;
}

// ============================================================================
// SCHEMA EXPORTS (for validation in main.ts)
// ============================================================================

export { TelegramUpdateSchema, TelegramMessageSchema, TelegramCallbackQuerySchema };
