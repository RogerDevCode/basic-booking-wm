/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Send/edit/delete Telegram messages + answer callback queries
 * DB Tables Used  : NONE — pure Telegram API dispatcher
 * Concurrency Risk: NO — independent API calls
 * GCal Calls      : NO
 * Idempotency Key : N/A — message sends are inherently non-idempotent
 * RLS Tenant ID   : NO — no DB queries
 * Zod Schemas     : YES — InputSchema validates all modes
 */

// ============================================================================
// TELEGRAM SEND — Notification + InlineKeyboard Service
// ============================================================================
// Modes:
// 1. send_message — POST /sendMessage (new message with optional inline keyboard)
// 2. edit_message — POST /editMessageText (replace existing message + keyboard)
// 3. answer_callback — POST /answerCallbackQuery (acknowledge button press)
// 4. delete_message — POST /deleteMessage (remove a message)
// All modes use 3-attempt exponential backoff retry.
// ============================================================================

import { z } from 'zod';

const InlineButtonSchema = z.object({
  text: z.string(),
  callback_data: z.string().max(64),
});

const InputSchema = z.object({
  chat_id: z.string().min(1),
  // ── Mode selector ──────────────────────────────────────────────
  mode: z.enum(['send_message', 'edit_message', 'answer_callback', 'delete_message'])
    .optional().default('send_message'),
  // ── For send_message / edit_message ────────────────────────────
  text: z.string().optional().default(''),
  message_id: z.number().int().optional(),
  inline_buttons: z.array(InlineButtonSchema).optional().default([]),
  parse_mode: z.enum(['Markdown', 'HTML']).nullable().optional().default(null),
  // ── For answer_callback ────────────────────────────────────────
  callback_query_id: z.string().optional(),
  callback_alert: z.string().optional(),
  // ── Legacy fields (backward compatibility) ─────────────────────
  message_type: z.string().optional(),
  booking_details: z.record(z.string(), z.unknown()).optional().default({}),
});

type InlineButton = z.infer<typeof InlineButtonSchema>;

interface TelegramApiResponse {
  readonly ok: boolean;
  readonly result?: { readonly message_id?: number };
  readonly description?: string;
  readonly error_code?: number;
}

interface TelegramSendResult {
  readonly sent: boolean;
  readonly message_id: number | null;
  readonly error: string | null;
}

interface TelegramSendData {
  readonly sent: boolean;
  readonly message_id: number | null;
  readonly chat_id: string;
  readonly mode: string;
}


// ── Keyboard builder ─────────────────────────────────────────────────

function buildInlineKeyboard(buttons: InlineButton[]): readonly { text: string; callback_data: string }[][] {
  if (buttons.length === 0) return [];
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  return rows;
}

// ── API dispatchers ──────────────────────────────────────────────────

async function sendTextMessage(
  botToken: string,
  chatId: string,
  text: string,
  buttons: InlineButton[],
  parseMode: string | null,
): Promise<TelegramSendResult> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    ...(parseMode ? { parse_mode: parseMode } : {}),
  };
  if (buttons.length > 0) {
    body['reply_markup'] = { inline_keyboard: buildInlineKeyboard(buttons) };
  }
  return await apiCallWithRetry(url, body);
}

async function editMessage(
  botToken: string,
  chatId: string,
  messageId: number,
  text: string,
  buttons: InlineButton[],
  parseMode: string | null,
): Promise<TelegramSendResult> {
  const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    ...(parseMode ? { parse_mode: parseMode } : {}),
  };
  if (buttons.length > 0) {
    body['reply_markup'] = { inline_keyboard: buildInlineKeyboard(buttons) };
  }
  return await apiCallWithRetry(url, body);
}

async function answerCallback(
  botToken: string,
  callbackQueryId: string,
  alert?: string,
): Promise<TelegramSendResult> {
  const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
  const body: Record<string, unknown> = {
    callback_query_id: callbackQueryId,
    ...(alert ? { text: alert, show_alert: false } : {}),
  };
  return await apiCallWithRetry(url, body);
}

async function deleteMessage(
  botToken: string,
  chatId: string,
  messageId: number,
): Promise<TelegramSendResult> {
  const url = `https://api.telegram.org/bot${botToken}/deleteMessage`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
  };
  return await apiCallWithRetry(url, body);
}

// ── Retry logic ──────────────────────────────────────────────────────

async function apiCallWithRetry(
  url: string,
  body: Record<string, unknown>,
  maxRetries = 3,
): Promise<TelegramSendResult> {
  let lastError: string | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 50 * attempt));
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });

      const data = (await response.json()) as TelegramApiResponse;

      if (response.ok && data.ok) {
        const msgId = typeof data.result?.message_id === 'number' ? data.result.message_id : null;
        return { sent: true, message_id: msgId, error: null };
      }

      const errDesc = typeof data.description === 'string' ? data.description : 'Unknown';
      const errCode = typeof data.error_code === 'number' ? data.error_code : 0;

      if (errCode >= 400 && errCode < 500 && errCode !== 429) {
        return { sent: false, message_id: null, error: `Permanent (${errCode}): ${errDesc}` };
      }

      lastError = `${errCode}: ${errDesc}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }

    if (attempt < maxRetries - 1) {
      await new Promise(r => setTimeout(r, 3 ** attempt * 1000));
    }
  }

  return { sent: false, message_id: null, error: `Failed after ${maxRetries} retries: ${lastError ?? 'Unknown'}` };
}

// ── Main entry point ─────────────────────────────────────────────────

export async function main(rawInput: unknown): Promise<[Error | null, TelegramSendData | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Invalid input: ${parsed.error.message}`), null];
  }

  const { mode, chat_id, text, message_id, inline_buttons, parse_mode, callback_query_id, callback_alert } = parsed.data;

  const botToken = process.env['TELEGRAM_BOT_TOKEN'];
  if (!botToken) return [new Error('TELEGRAM_BOT_TOKEN not configured'), null];

  let result: TelegramSendResult;

  switch (mode) {
    case 'send_message':
      result = await sendTextMessage(botToken, chat_id, text || '', inline_buttons, parse_mode);
      break;

    case 'edit_message':
      if (message_id === undefined) return [new Error('edit_message requires message_id'), null];
      result = await editMessage(botToken, chat_id, message_id, text || '', inline_buttons, parse_mode);
      break;

    case 'answer_callback':
      if (!callback_query_id) return [new Error('answer_callback requires callback_query_id'), null];
      result = await answerCallback(botToken, callback_query_id, callback_alert);
      break;

    case 'delete_message':
      if (message_id === undefined) return [new Error('delete_message requires message_id'), null];
      result = await deleteMessage(botToken, chat_id, message_id);
      break;
  }

  if (!result.sent) {
    return [new Error(result.error ?? 'Failed to execute Telegram API call'), null];
  }

  return [null, { sent: result.sent, message_id: result.message_id, chat_id, mode }];
}
