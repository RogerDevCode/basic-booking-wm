// Telegram Webhook Trigger
// Recibe el payload de Telegram y extrae datos básicos

interface TelegramMessage {
  chat?: { id?: number | string };
  text?: string;
  from?: { id?: number | string; first_name?: string };
}

interface TelegramEvent {
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

export async function main(event: TelegramEvent) {
  const message = event.message ?? event.channel_post;

  return {
    chat_id: String(message?.chat?.id ?? message?.from?.id ?? ''),
    text: message?.text ?? '',
    username: message?.from?.first_name ?? 'User',
    raw_event: event,
  };
}
