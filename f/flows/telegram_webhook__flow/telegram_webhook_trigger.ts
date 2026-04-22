import { z } from "zod";

/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Extract normalized fields from Telegram webhook event (message + callback_query)
 * DB Tables Used  : NONE — pure event parsing
 * Concurrency Risk: NO — stateless
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : YES — for robust payload validation
 */

/**
 * TELEGRAM WEBHOOK TRIGGER — Event normalization
 * 
 * This module follows SOLID principles by using Zod for validation (SRP),
 * centralizing shared access logic (DRY), and maintaining a clean, deterministic
 * flow (KISS). Adheres to Go-style Result pattern.
 */

// ============================================================================
// Schemas & Types
// ============================================================================

const TelegramUserSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  first_name: z.string().optional(),
  username: z.string().optional(),
});

const TelegramMessageSchema = z.object({
  message_id: z.number().optional(),
  chat: z.object({ 
    id: z.union([z.number(), z.string()]).optional() 
  }).optional(),
  text: z.string().optional(),
  from: TelegramUserSchema.optional(),
});

const CallbackQuerySchema = z.object({
  id: z.string().optional(),
  data: z.string().optional(),
  from: TelegramUserSchema.optional(),
  message: TelegramMessageSchema.optional(),
});

/**
 * Validates the incoming Telegram webhook payload.
 */
const TelegramEventSchema = z.object({
  message: TelegramMessageSchema.optional(),
  channel_post: TelegramMessageSchema.optional(),
  callback_query: CallbackQuerySchema.optional(),
}).refine(data => !!(data.message || data.channel_post || data.callback_query), {
  message: "event must contain at least one of: message, channel_post, or callback_query",
});

type TelegramEvent = z.infer<typeof TelegramEventSchema>;

export interface TriggerOutput {
  readonly chat_id: string;
  readonly text: string;
  readonly username: string;
  readonly callback_data: string | null;
  readonly callback_query_id: string | null;
  readonly callback_message_id: number | null;
  readonly raw_event: TelegramEvent | null;
  readonly error: string | null;
}

// ============================================================================
// Internal Helpers — Single Responsibility & DRY
// ============================================================================

/**
 * DRY: Extracts the primary source of conversation data from the event.
 */
function getEventSource(event: Readonly<TelegramEvent>) {
  return event.message ?? event.channel_post ?? event.callback_query?.message;
}

/**
 * SRP: Extracts chat_id with falling priority: 
 * message -> callback message -> sender ID.
 */
function extractChatId(event: Readonly<TelegramEvent>): string {
  const source = getEventSource(event);
  const rawId = source?.chat?.id ?? event.callback_query?.from?.id ?? "";
  return String(rawId);
}

/**
 * SRP: Extracts the message text if present.
 */
function extractText(event: Readonly<TelegramEvent>): string {
  return getEventSource(event)?.text ?? "";
}

/**
 * SRP: Extracts the sender's display name or username.
 */
function extractUsername(event: Readonly<TelegramEvent>): string {
  const source = event.message?.from 
    ?? event.channel_post?.from 
    ?? event.callback_query?.from;

  return source?.first_name ?? source?.username ?? "User";
}

/**
 * SRP: Extracts metadata specifically for callback interactions.
 */
function extractCallbackInfo(event: Readonly<TelegramEvent>) {
  const cb = event.callback_query;
  return {
    data: cb?.data ?? null,
    id: cb?.id ?? null,
    messageId: cb?.message?.message_id ?? null,
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Normalizes Telegram webhook events into a consistent internal format.
 */
export async function main(
  event: unknown,
): Promise<TriggerOutput> {
  const parseResult = TelegramEventSchema.safeParse(event);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues.map((e) => e.message).join(", ");
    return Object.freeze({
      chat_id: "",
      text: "",
      username: "",
      callback_data: null,
      callback_query_id: null,
      callback_message_id: null,
      raw_event: null,
      error: `invalid_telegram_payload: ${errorMsg}`,
    });
  }

  const parsedEvent = parseResult.data;
  const callbackInfo = extractCallbackInfo(parsedEvent);

  return Object.freeze({
    chat_id: extractChatId(parsedEvent),
    text: extractText(parsedEvent),
    username: extractUsername(parsedEvent),
    callback_data: callbackInfo.data,
    callback_query_id: callbackInfo.id,
    callback_message_id: callbackInfo.messageId,
    raw_event: parsedEvent,
    error: null,
  });
}
