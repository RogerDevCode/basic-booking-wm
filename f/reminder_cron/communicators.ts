import type { ScriptResponse } from './types.ts';

export async function sendTelegramReminder(
  chatId: string,
  messageType: string,
  details: Record<string, string>,
  buttons: { text: string; callback_data: string }[]
): Promise<{ sent: boolean; error: string | null }> {
  try {
    const botToken = process.env['TELEGRAM_BOT_TOKEN'];
    if (!botToken) return { sent: false, error: 'TELEGRAM_BOT_TOKEN not configured' };

    const url = `${process.env['WINDMILL_BASE_URL'] ?? ''}/api/scripts/f/telegram_send`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_type: messageType,
        booking_details: details,
        inline_buttons: buttons,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return { sent: false, error: `HTTP ${String(response.status)}` };
    }

    const result = (await response.json()) as ScriptResponse;
    return { sent: result.success === true, error: result.error_message ?? null };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendGmailReminder(
  email: string,
  messageType: string,
  details: Record<string, string>,
  bookingId: string
): Promise<{ sent: boolean; error: string | null }> {
  try {
    const baseUrl = process.env['WINDMILL_BASE_URL'] ?? '';
    const actionLinks = [
      { text: 'Confirmar Cita', url: `${baseUrl}/api/webhooks/booking/confirm?id=${bookingId}`, style: 'primary' as const },
      { text: 'Cancelar Cita', url: `${baseUrl}/api/webhooks/booking/cancel?id=${bookingId}`, style: 'danger' as const },
      { text: 'Reprogramar', url: `${baseUrl}/api/webhooks/booking/reschedule?id=${bookingId}`, style: 'secondary' as const },
    ];

    const url = `${baseUrl}/api/scripts/f/gmail_send`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient_email: email,
        message_type: messageType,
        booking_details: details,
        action_links: actionLinks,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return { sent: false, error: `HTTP ${String(response.status)}` };
    }

    const result = (await response.json()) as ScriptResponse;
    return { sent: result.success === true, error: result.error_message ?? null };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
