import { z } from "zod";
import "@total-typescript/ts-reset";
import { Result, ok, err } from "../../internal/types/domain";

// ============================================================================
// SSOT STRICT TYPING DEFINITIONS
// ============================================================================

export const TelegramSendInputSchema = z.object({
  chat_id: z.string().min(1),
  text: z.string().min(1),
  parse_mode: z.enum(["MarkdownV2", "HTML"]).nullish().transform(v => v ?? null),
}).strict();

export type TelegramSendInput = z.infer<typeof TelegramSendInputSchema>;

export const TelegramResourceSchema = z.object({
  bot_token: z.string().min(1),
}).strict();

type TelegramResponse = {
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error_code?: number;
  readonly description?: string;
};

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function main(
  rawInput: unknown,
  rawResource: unknown
): Promise<Result<{ readonly message_id: number; readonly chat_id: string; readonly status: string }, Error>> {
  
  // 1. Boundary Validation
  const inputParsed = TelegramSendInputSchema.safeParse(rawInput);
  if (!inputParsed.success) {
    return err(new Error(`Invalid input: ${inputParsed.error.message}`));
  }

  const resourceParsed = TelegramResourceSchema.safeParse(rawResource);
  let botToken = "";
  if (resourceParsed.success) {
    botToken = resourceParsed.data.bot_token;
  } else {
    // Fallback to process.env
    const envToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!envToken) {
      return err(new Error("Telegram bot token not configured in resource or environment"));
    }
    botToken = envToken;
  }

  const input = inputParsed.data;
  let text = input.text;

  if (input.parse_mode === "MarkdownV2") {
    text = sanitizeForMarkdownV2(text);
  }

  const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const body = new URLSearchParams();
  body.append("chat_id", input.chat_id);
  body.append("text", text);
  if (input.parse_mode !== null) {
    body.append("parse_mode", input.parse_mode);
  }

  // 2. Execution with Retries
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await attemptSend(apiUrl, body);
    
    if (result.success) {
      return ok(result.data);
    }

    lastError = result.error;

    if (isPermanentTelegramError(lastError.message)) {
      return err(lastError);
    }

    if (attempt < MAX_RETRIES - 1) {
      const backoffMs = Math.pow(3, attempt) * 1000;
      await new Promise(res => setTimeout(res, backoffMs));
    }
  }

  return err(new Error(`Failed to send Telegram message after ${MAX_RETRIES} attempts. Last error: ${lastError?.message}`));
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function attemptSend(apiUrl: string, body: URLSearchParams): Promise<Result<{ readonly message_id: number; readonly chat_id: string; readonly status: string }, Error>> {
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = await response.json() as TelegramResponse;

    if (!response.ok || !data.ok) {
      return err(new Error(`[${data.error_code ?? response.status}] ${data.description ?? response.statusText}`));
    }

    const messageResult = z.object({
      message_id: z.number()
    }).passthrough().safeParse(data.result);

    if (!messageResult.success) {
      return err(new Error("Failed to parse message_id from Telegram response"));
    }

    return ok({
      message_id: messageResult.data.message_id,
      chat_id: body.get("chat_id") ?? "unknown",
      status: "SENT"
    });
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

function sanitizeForMarkdownV2(text: string): string {
  const specialChars = ["_", "*", "[", "]", "(", ")", "~", "`", ">", "#", "+", "-", "=", "|", "{", "}", ".", "!"];
  let escaped = text;
  for (const char of specialChars) {
    // We use a simple global replacement
    escaped = escaped.split(char).join(`\\${char}`);
  }
  return escaped;
}

function isPermanentTelegramError(errorMessage: string): boolean {
  const permanentCodes = ["[400]", "[401]", "[403]", "[404]", "[409]"];
  return permanentCodes.some(code => errorMessage.includes(code));
}
