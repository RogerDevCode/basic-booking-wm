import { z } from 'zod';
import type { Result } from '../internal/result/index.ts';
import { retryWithBackoff } from '../internal/retry/index.ts';
import { MAX_RETRIES, TIMEOUT_TELEGRAM_API_MS } from '../internal/config/index.ts';
import {
  InlineButtonSchema,
  TelegramResponseSchema,
} from './types.ts';
import type {
  Input,
  TelegramResponse,
  TelegramSendData,
} from './types.ts';

// ============================================================================
// TELEGRAM SERVICE — SRP: API Communication & Logic
// ============================================================================

export class TelegramService {
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

    const chatId = 'chat_id' in input && typeof input.chat_id === 'string'
      ? input.chat_id
      : undefined;

    return [null, {
      sent: true,
      message_id: msgId,
      mode: input.mode,
      ...(chatId ? { chat_id: chatId } : {}),
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
