// ============================================================================
// MESSAGE PARSER — Telegram Webhook Normalization (v3.1)
// Pattern: Precision Architecture, No 'any', No assertions
// ============================================================================

import { z } from "zod";

const MessageParserInputSchema = z.object({
  chat_id: z.string().min(1).regex(/^\d+$/, "chat_id must be a positive integer"),
  text: z.string().trim().min(1).max(500),
}).readonly();

export interface MessageParserData {
  readonly chat_id: number;
  readonly text: string;
  readonly username: string;
  readonly type: string;
}

export interface MessageParserResponse {
  readonly success: boolean;
  readonly error_code: string | null;
  readonly error_message: string | null;
  readonly data: MessageParserData | null;
  readonly _meta: {
    readonly source: string;
    readonly timestamp: string;
    readonly workflow_id: string;
    readonly version: string;
  };
}

/**
 * Normalizes incoming Telegram messages for the booking system pipeline.
 */
export async function main(rawInput: unknown): Promise<MessageParserResponse> {
  const source = "NN_02_Message_Parser";
  const workflowID = "message-parser-v1";
  const version = "2.1.0";

  const parsedInput = MessageParserInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    return {
      success: false,
      error_code: 'VALIDATION_ERROR',
      error_message: parsedInput.error.message,
      data: null,
      _meta: { 
        source,
        timestamp: new Date().toISOString(),
        workflow_id: workflowID,
        version
      }
    };
  }

  const { chat_id, text } = parsedInput.data;
  const chatIdNum = Number(chat_id);

  // === SANITIZE FOR DOWNSTREAM ===
  // Note: We use parameterized queries in DB, but we still sanitize here
  const safeText = text
    .replaceAll('\\', '\\\\')
    .replaceAll('\'', "''")
    .slice(0, 500);

  return {
    success: true,
    error_code: null,
    error_message: null,
    data: {
      chat_id: chatIdNum,
      text: safeText,
      username: "User",
      type: 'text'
    },
    _meta: { 
      source,
      timestamp: new Date().toISOString(),
      workflow_id: workflowID,
      version
    }
  };
}
