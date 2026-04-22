import { z } from 'zod';
import { MAX_TELEGRAM_CALLBACK_DATA_BYTES } from '../internal/config/index';

export const InlineButtonSchema = z.object({
  text: z.string().min(1),
  callback_data: z.string().max(MAX_TELEGRAM_CALLBACK_DATA_BYTES),
});

const BaseInputSchema = z.object({
  chat_id: z.string().min(1),
  parse_mode: z.enum(['Markdown', 'HTML']).nullable().optional().default(null),
});

export const SendMessageSchema = BaseInputSchema.extend({
  mode: z.literal('send_message').default('send_message'),
  text: z.string().min(1),
  inline_buttons: z.array(InlineButtonSchema).optional().default([]),
  message_id: z.number().int().optional(),
});

export const EditMessageSchema = BaseInputSchema.extend({
  mode: z.literal('edit_message'),
  message_id: z.number().int(),
  text: z.string().min(1),
  inline_buttons: z.array(InlineButtonSchema).optional().default([]),
});

export const DeleteMessageSchema = z.object({
  mode: z.literal('delete_message'),
  chat_id: z.string().min(1),
  message_id: z.number().int(),
  text: z.string().optional(),
  parse_mode: z.enum(['Markdown', 'HTML']).nullable().optional(),
  inline_buttons: z.array(InlineButtonSchema).optional(),
});

export const AnswerCallbackSchema = z.object({
  mode: z.literal('answer_callback'),
  callback_query_id: z.string().min(1),
  callback_alert: z.string().optional(),
  chat_id: z.string().optional(),
  text: z.string().optional(),
  parse_mode: z.enum(['Markdown', 'HTML']).nullable().optional(),
  inline_buttons: z.array(InlineButtonSchema).optional(),
  message_id: z.number().int().optional(),
});

export const InputSchema = z.discriminatedUnion('mode', [
  SendMessageSchema,
  EditMessageSchema,
  DeleteMessageSchema,
  AnswerCallbackSchema,
]);

export type Input = z.infer<typeof InputSchema>;

// ─── API Response Schemas ───────────────────────────────────────────────────

export const TelegramResponseSchema = z.object({
  ok: z.boolean(),
  result: z.object({
    message_id: z.number().optional(),
  }).optional(),
  description: z.string().optional(),
  error_code: z.number().optional(),
});

export type TelegramResponse = z.infer<typeof TelegramResponseSchema>;

// ─── Internal Types ─────────────────────────────────────────────────────────

export interface TelegramSendData {
  readonly sent: boolean;
  readonly message_id: number | null;
  readonly chat_id?: string;
  readonly mode: string;
}
