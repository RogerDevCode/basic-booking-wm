// Telegram Webhook Trigger
// Recibe el payload de Telegram y extrae datos básicos
// Go-style: no throw, no any, no as. Tuple return.

interface TelegramMessage {
  readonly chat?: { readonly id?: number | string };
  readonly text?: string;
  readonly from?: { readonly id?: number | string; readonly first_name?: string };
}

interface CallbackQuery {
  readonly id?: string;
  readonly data?: string;
  readonly from?: { readonly id?: number | string };
  readonly message?: TelegramMessage;
}

interface TelegramEvent {
  readonly message?: TelegramMessage;
  readonly channel_post?: TelegramMessage;
  readonly callback_query?: CallbackQuery;
}

function isTelegramEvent(raw: unknown): raw is TelegramEvent {
  return typeof raw === 'object' && raw !== null && (
    'message' in raw ||
    'channel_post' in raw ||
    'callback_query' in raw
  );
}

export async function main(rawInput: unknown): Promise<[Error | null, { chat_id: string, text: string, username: string, callback_data: string | null, callback_query_id: string | null, raw_event: TelegramEvent } | null]> {
  if (!isTelegramEvent(rawInput)) {
    return [new Error('Invalid Telegram event payload'), null];
  }

  const event = rawInput;
  const message = event.message ?? event.channel_post;
  const callback = event.callback_query;

  // Priority: callback_data from callback_query, text from message
  const text = message?.text ?? (callback?.data ? '' : '');

  return [null, {
    chat_id: String(message?.chat?.id ?? message?.from?.id ?? callback?.from?.id ?? ''),
    text,
    username: String(message?.from?.first_name ?? callback?.from?.id ?? 'User'),
    callback_data: callback?.data ?? null,
    callback_query_id: callback?.id ?? null,
    raw_event: event,
  }];
}
