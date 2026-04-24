//nobundling
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

import type { Result } from '../internal/result/index.ts';
import { requireTelegramBotToken } from '../internal/config/index.ts';
import { InputSchema } from './types.ts';
import type { TelegramSendData } from './types.ts';
import { TelegramService } from './services.ts';

// ============================================================================
// MAIN — Entry Point Orchestrator
// ============================================================================

export async function main(args: any) : Promise<Result<TelegramSendData>> {
const chat_id = args?.chat_id ?? '';
  const text = args?.text ?? '';
  const mode = args?.mode ?? 'send_message';
  const message_id = args?.message_id ?? null;
  const inline_buttons = args?.inline_buttons ?? [];
  const parse_mode = args?.parse_mode ?? 'Markdown';
  const callback_query_id = args?.callback_query_id ?? null;
  const callback_alert = args?.callback_alert ?? '';

  const rawInput = {
    chat_id,
    text,
    mode,
    message_id,
    inline_buttons,
    parse_mode,
    callback_query_id,
    callback_alert,
  };
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const errorDetail = JSON.stringify(parsed.error.issues);
    console.error('telegram_send validation error:', errorDetail);
    console.error('raw input was:', JSON.stringify(rawInput));
    return [new Error(`INVALID_INPUT: ${parsed.error.message} | Issues: ${errorDetail}`), null];
  }

  // 2. Resolve Dependencies — AGENTS.md §2.3 (DIP)
  const [tokenErr, botToken] = requireTelegramBotToken();
  if (tokenErr !== null || !botToken) {
    return [tokenErr ?? new Error('TELEGRAM_BOT_TOKEN_MISSING'), null];
  }

  // 3. Execute Mission — SRP: Dispatch to service
  const service = new TelegramService(botToken);
  const [err, result] = await service.execute(parsed.data);
  if (err !== null) {
    console.error('Telegram Service Error:', err instanceof Error ? err.message : String(err));
    return [err, null];
  }
  return [null, result];
}