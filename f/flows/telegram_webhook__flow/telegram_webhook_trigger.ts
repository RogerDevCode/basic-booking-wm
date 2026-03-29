// Telegram Webhook Trigger
// Recibe el payload de Telegram y extrae datos básicos

export async function main(event: any) {
  // Telegram envía: { message: { chat: { id }, text, from } }
  const message = event.message || event.channel_post || event;
  
  return {
    chat_id: String(message.chat?.id || message.from?.id || ""),
    text: message.text || "",
    username: message.from?.first_name || "User",
    raw_event: event
  };
}
