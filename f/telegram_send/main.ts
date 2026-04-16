/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Send/edit/delete Telegram messages + answer callback queries
 * DB Tables Used  : NONE — pure Telegram API dispatcher
 * Concurrency Risk: NO — independent API calls
 * GCal Calls      : NO
 * Idempotency Key : N/A — message sends are inherently non-idempotent
 * RLS Tenant ID   : NO — no DB queries
 * Zod Schemas     : YES — Discriminated union validates all modes
 */

import { z } from 'zod';
import type { Result } from '../internal/result';
import { retryWithBackoff } from '../internal/retry';
import {
  MAX_RETRIES,
  TIMEOUT_TELEGRAM_API_MS,
  MAX_TELEGRAM_CALLBACK_DATA_BYTES,
  requireTelegramBotToken,
} from '../internal/config';

// ============================================================================
// SCHEMAS — AGENTS.md §2.1: Single Source of Truth
// ============================================================================

const InlineButtonSchema = z.object({
  text: z.string().min(1),
  callback_data: z.string().max(MAX_TELEGRAM_CALLBACK_DATA_BYTES),
});

const BaseInputSchema = z.object({
  chat_id: z.string().min(1),
  parse_mode: z.enum(['Markdown', 'HTML']).nullable().optional().default(null),
});

const SendMessageSchema = BaseInputSchema.extend({
  mode: z.literal('send_message').default('send_message'),
  text: z.string().min(1),
  inline_buttons: z.array(InlineButtonSchema).optional().default([]),
});

const EditMessageSchema = BaseInputSchema.extend({
  mode: z.literal('edit_message'),
  message_id: z.number().int(),
  text: z.string().min(1),
  inline_buttons: z.array(InlineButtonSchema).optional().default([]),
});

const DeleteMessageSchema = z.object({
  mode: z.literal('delete_message'),
  chat_id: z.string().min(1),
  message_id: z.number().int(),
});

const AnswerCallbackSchema = z.object({
  mode: z.literal('answer_callback'),
  callback_query_id: z.string().min(1),
  callback_alert: z.string().optional(),
});

const InputSchema = z.discriminatedUnion('mode', [
  SendMessageSchema,
  EditMessageSchema,
  DeleteMessageSchema,
  AnswerCallbackSchema,
]);

type Input = z.infer<typeof InputSchema>;

// ─── API Response Schemas ───────────────────────────────────────────────────

const TelegramResponseSchema = z.object({
  ok: z.boolean(),
  result: z.object({
    message_id: z.number().optional(),
  }).optional(),
  description: z.string().optional(),
  error_code: z.number().optional(),
});

type TelegramResponse = z.infer<typeof TelegramResponseSchema>;

// ─── Internal Types ─────────────────────────────────────────────────────────

export interface TelegramSendData {
  readonly sent: boolean;
  readonly message_id: number | null;
  readonly chat_id?: string;
  readonly mode: string;
}

// ============================================================================
// TELEGRAM SERVICE — SRP: API Communication & Logic
// ============================================================================

class TelegramService {
  private readonly botToken: string;

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  /**
   * Orchestrates the API call with retry logic.
   * AGENTS.md §1.A.3: Returns Result<T>
   */
  async execute(input: Readonly<Input>): Promise<Result<TelegramSendData>> {
    const [endpoint, body] = this.prepareRequest(input);

    const retryResult = await retryWithBackoff(
      () => this.apiCall(endpoint, body),
      {
        operationName: `TelegramAPI:${input.mode}`,
        maxAttempts: MAX_RETRIES,
      }
    );

    if (!retryResult.success) {
      return [retryResult.error, null];
    }

    const data = retryResult.data;
    const msgId = data.result?.message_id ?? null;

    return [null, {
      sent: true,
      message_id: msgId,
      mode: input.mode,
      ...('chat_id' in input ? { chat_id: input.chat_id } : {}),
    }];
  }

  /**
   * Maps input mode to Telegram endpoint and body.
   */
  private prepareRequest(input: Readonly<Input>): [string, Record<string, unknown>] {
    const baseUrl = `https://api.telegram.org/bot${this.botToken}`;

    switch (input.mode) {
      case 'send_message':
        return [
          `${baseUrl}/sendMessage`,
          {
            chat_id: input.chat_id,
            text: input.text,
            ...(input.parse_mode ? { parse_mode: input.parse_mode } : {}),
            ...(input.inline_buttons.length > 0 ? {
              reply_markup: { inline_keyboard: this.buildInlineKeyboard(input.inline_buttons) }
            } : {}),
          }
        ];

      case 'edit_message':
        return [
          `${baseUrl}/editMessageText`,
          {
            chat_id: input.chat_id,
            message_id: input.message_id,
            text: input.text,
            ...(input.parse_mode ? { parse_mode: input.parse_mode } : {}),
            ...(input.inline_buttons.length > 0 ? {
              reply_markup: { inline_keyboard: this.buildInlineKeyboard(input.inline_buttons) }
            } : {}),
          }
        ];

      case 'delete_message':
        return [
          `${baseUrl}/deleteMessage`,
          {
            chat_id: input.chat_id,
            message_id: input.message_id,
          }
        ];

      case 'answer_callback':
        return [
          `${baseUrl}/answerCallbackQuery`,
          {
            callback_query_id: input.callback_query_id,
            ...(input.callback_alert ? { text: input.callback_alert, show_alert: true } : {}),
          }
        ];
    }
  }

  /**
   * Low-level fetch call.
   * @throws Error if response is not ok (to trigger retry)
   */
  private async apiCall(url: string, body: Record<string, unknown>): Promise<TelegramResponse> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_TELEGRAM_API_MS),
    });

    const rawData: unknown = await response.json();
    const parsed = TelegramResponseSchema.safeParse(rawData);

    if (!parsed.success) {
      throw new Error(`MALFORMED_RESPONSE: ${parsed.error.message}`);
    }

    const data = parsed.data;

    if (!response.ok || !data.ok) {
      const desc = data.description ?? 'Unknown error';
      const code = data.error_code ?? 0;
      throw new Error(`TELEGRAM_ERROR_${String(code)}: ${desc}`);
    }

    return data;
  }

  /**
   * Helper to chunk buttons into rows of 2.
   */
  private buildInlineKeyboard(buttons: readonly z.infer<typeof InlineButtonSchema>[]): { text: string; callback_data: string }[][] {
    const rows: { text: string; callback_data: string }[][] = [];
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2).map(b => ({ ...b })));
    }
    return rows;
  }
}

// ============================================================================
// MAIN — Entry Point Orchestrator
// ============================================================================

export async function main(rawInput: unknown): Promise<Result<TelegramSendData>> {
  // 1. Validate Input — AGENTS.md §1.B.8
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`INVALID_INPUT: ${parsed.error.message}`), null];
  }

  // 2. Resolve Dependencies — AGENTS.md §2.3 (DIP)
  const [tokenErr, botToken] = requireTelegramBotToken();
  if (tokenErr !== null || !botToken) {
    return [tokenErr ?? new Error('TELEGRAM_BOT_TOKEN_MISSING'), null];
  }

  // 3. Execute Mission — SRP: Dispatch to service
  const service = new TelegramService(botToken);
  return await service.execute(parsed.data);
}
