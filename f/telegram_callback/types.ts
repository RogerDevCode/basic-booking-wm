import { z } from 'zod';

export const InputSchema = z.object({
  callback_query_id: z.string().min(1),
  callback_data: z.string().min(1).max(64),
  chat_id: z.string().min(1),
  message_id: z.string().optional(),
  user_id: z.string().optional(),
  client_id: z.string().optional(),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export const ACTION_MAP: Record<string, string> = {
  'cnf': 'confirm',
  'cxl': 'cancel',
  'res': 'reagendar_cita',
  'act': 'activate_reminders',
  'dea': 'deactivate_reminders',
  'ack': 'acknowledge',
};

export function parseCallbackData(data: string): { action: string; booking_id: string } | null {
  const parts = data.split(':');
  if (parts.length !== 2) return null;

  const actionCode = parts[0];
  const bookingId = parts[1];

  if (!actionCode || !bookingId) return null;

  const action = ACTION_MAP[actionCode];
  if (!action) return null;

  return { action, booking_id: bookingId };
}