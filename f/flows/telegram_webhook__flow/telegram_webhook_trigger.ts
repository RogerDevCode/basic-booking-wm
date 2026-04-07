// Telegram Webhook Trigger
// Recibe el payload de Telegram y extrae datos básicos
// Go-style: no throw, no any, no as. Tuple return.

interface TelegramMessage {
  readonly chat?: { readonly id?: number | string };
  readonly text?: string;
  readonly from?: { readonly id?: number | string; readonly first_name?: string };
}

interface TelegramEvent {
  readonly message?: TelegramMessage;
  readonly channel_post?: TelegramMessage;
}

function isTelegramEvent(raw: unknown): raw is TelegramEvent {
  return typeof raw === 'object' && raw !== null && (
    'message' in (raw as Record<string, unknown>) ||
    'channel_post' in (raw as Record<string, unknown>)
  );
}

export async function main(rawInput: unknown): Promise<[Error | null, { chat_id: string, text: string, username: string, raw_event: TelegramEvent } | null]> {
  if (!isTelegramEvent(rawInput)) {
    return [new Error('Invalid Telegram event payload'), null];
  }

  const event = rawInput;
  const message = event.message ?? event.channel_post;

  return [null, {
    chat_id: String(message?.chat?.id ?? message?.from?.id ?? ''),
    text: message?.text ?? '',
    username: message?.from?.first_name ?? 'User',
    raw_event: event,
  }];
}
