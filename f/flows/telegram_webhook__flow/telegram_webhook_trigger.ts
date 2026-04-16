/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Extract normalized fields from Telegram webhook event (message + callback_query)
 * DB Tables Used  : NONE — pure event parsing
 * Concurrency Risk: NO — stateless
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : NO — interface-level type guards only (no external deps in trigger)
 */

/**
 * TELEGRAM WEBHOOK TRIGGER — Event normalization
 * 
 * This module follows SRP by delegating extraction of specific fields to 
 * specialized internal functions. It adheres to the Go-style Result pattern
 * for robust error handling and strict type safety.
 */

interface TelegramUser {
  readonly id?: number | string;
  readonly first_name?: string;
}

interface TelegramMessage {
  readonly message_id?: number;
  readonly chat?: { readonly id?: number | string };
  readonly text?: string;
  readonly from?: TelegramUser;
}

interface CallbackQuery {
  readonly id?: string;
  readonly data?: string;
  readonly from?: TelegramUser;
  readonly message?: TelegramMessage;
}

interface TelegramEvent {
  readonly message?: TelegramMessage;
  readonly channel_post?: TelegramMessage;
  readonly callback_query?: CallbackQuery;
}

interface TriggerOutput {
  readonly chat_id: string;
  readonly text: string;
  readonly username: string;
  readonly callback_data: string | null;
  readonly callback_query_id: string | null;
  readonly callback_message_id: number | null;
  readonly raw_event: TelegramEvent;
}

// ============================================================================
// Internal Helpers — Single Responsibility Extraction Logic
// ============================================================================

/**
 * Extracts chat_id with falling priority: 
 * message -> callback message -> sender ID
 */
function extractChatId(event: Readonly<TelegramEvent>): string {
  const message = event.message ?? event.channel_post;
  const callback = event.callback_query;

  const rawId = message?.chat?.id 
    ?? callback?.message?.chat?.id 
    ?? callback?.from?.id 
    ?? '';

  return String(rawId);
}

/**
 * Extracts the message text if present.
 */
function extractText(event: Readonly<TelegramEvent>): string {
  return event.message?.text ?? event.channel_post?.text ?? '';
}

/**
 * Extracts the sender's name or defaults to 'User'.
 */
function extractUsername(event: Readonly<TelegramEvent>): string {
  const message = event.message ?? event.channel_post;
  const callback = event.callback_query;

  return message?.from?.first_name 
    ?? callback?.from?.first_name 
    ?? 'User';
}

/**
 * Extracts metadata from callback queries, including the embedded message ID.
 */
function extractCallbackInfo(callback?: Readonly<CallbackQuery>): {
  readonly data: string | null;
  readonly id: string | null;
  readonly messageId: number | null;
} {
  return {
    data: callback?.data ?? null,
    id: callback?.id ?? null,
    messageId: typeof callback?.message?.message_id === 'number' 
      ? callback.message.message_id 
      : null,
  };
}

// ============================================================================
// Type Guard
// ============================================================================

/**
 * Validates that the input is a valid Telegram event object.
 * Uses narrowing instead of prohibited type casting.
 */
function isTelegramEvent(raw: unknown): raw is TelegramEvent {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  
  return (
    'message' in raw || 
    'channel_post' in raw || 
    'callback_query' in raw
  );
}

// ============================================================================
// Main Entry Point
// ============================================================================

export async function main(
  rawInput: unknown,
): Promise<[Error | null, TriggerOutput | null]> {
  // 1. Validate Input Payload
  if (!isTelegramEvent(rawInput)) {
    return [new Error('invalid_telegram_payload: event must contain message, channel_post or callback_query'), null];
  }

  const event: TelegramEvent = rawInput;

  // 2. Extract and Normalize Fields (SRP)
  const chat_id = extractChatId(event);
  const text = extractText(event);
  const username = extractUsername(event);
  const callbackInfo = extractCallbackInfo(event.callback_query);

  // 3. Construct Immutable Result
  const output: TriggerOutput = {
    chat_id,
    text,
    username,
    callback_data: callbackInfo.data,
    callback_query_id: callbackInfo.id,
    callback_message_id: callbackInfo.messageId,
    raw_event: event,
  };

  return [null, Object.freeze(output)];
}
