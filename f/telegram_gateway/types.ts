import { z } from 'zod';

export const TelegramUserSchema = z.object({
  id: z.number(),
  is_bot: z.boolean().optional(),
  first_name: z.string().default('Usuario'),
  last_name: z.string().optional(),
  username: z.string().optional(),
});

export const TelegramMessageSchema = z.object({
  message_id: z.number(),
  from: TelegramUserSchema.optional(),
  chat: z.object({
    id: z.number(),
    type: z.enum(['private', 'group', 'supergroup', 'channel']),
  }),
  date: z.number(),
  text: z.string().optional(),
});

export const TelegramCallbackQuerySchema = z.object({
  id: z.string(),
  from: TelegramUserSchema,
  message: TelegramMessageSchema.optional(),
  data: z.string(),
});

export const TelegramUpdateSchema = z.object({
  update_id: z.number(),
  message: TelegramMessageSchema.optional(),
  callback_query: TelegramCallbackQuerySchema.optional(),
});

export type TelegramUpdate = z.infer<typeof TelegramUpdateSchema>;
export type TelegramMessage = NonNullable<TelegramUpdate['message']>;
export type TelegramCallback = NonNullable<TelegramUpdate['callback_query']>;

export interface SendMessageOptions {
  readonly parse_mode?: 'Markdown' | 'HTML' | 'MarkdownV2';
  readonly reply_markup?: Readonly<Record<string, unknown>>;
}

export interface ITelegramClient {
  sendMessage(chatId: string, text: string, options?: SendMessageOptions): Promise<import('../internal/result').Result<unknown>>;
}

export interface IClientRepository {
  ensureRegistered(fullName: string): Promise<import('../internal/result').Result<void>>;
}