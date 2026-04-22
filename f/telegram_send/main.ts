/*
 * REASONING TRACE
 * ### Decomposition: [Split monolith into types, services, and main orchestrator]
 * ### Schema X-Check: [NONE]
 * ### Failure Modes: [Telegram API failure — retryWithBackoff handles it]
 * ### Concurrency: [NO]
 * ### SOLID/DRY/KISS: [SRP YES | DRY YES | KISS YES]
 * → CLEARED FOR CODE GENERATION
 */

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

import type { Result } from '../internal/result/index';
import { requireTelegramBotToken } from '../internal/config/index';
import { InputSchema } from './types';
import type { TelegramSendData } from './types';
import { TelegramService } from './services';

// ============================================================================
// MAIN — Entry Point Orchestrator
// ============================================================================

export async function main(
  mode: string,
  chat_id?: string,
  text?: string,
  parse_mode?: string,
  inline_buttons?: unknown,
  message_id?: number,
  callback_query_id?: string,
  callback_alert?: string,
): Promise<Result<TelegramSendData>> {
  const rawInput: Record<string, unknown> = { mode };
  if (chat_id !== undefined && chat_id !== null && chat_id !== '') rawInput['chat_id'] = chat_id;
  if (text !== undefined && text !== null && text !== '') rawInput['text'] = text;
  if (parse_mode !== undefined && parse_mode !== null && parse_mode !== '') rawInput['parse_mode'] = parse_mode;
  if (inline_buttons !== undefined && inline_buttons !== null) rawInput['inline_buttons'] = inline_buttons;
  if (message_id !== undefined && message_id !== null) rawInput['message_id'] = message_id;
  if (callback_query_id !== undefined && callback_query_id !== null && callback_query_id !== '') rawInput['callback_query_id'] = callback_query_id;
  if (callback_alert !== undefined && callback_alert !== null && callback_alert !== '') rawInput['callback_alert'] = callback_alert;

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
