import { z } from 'zod';

export const InputSchema = z.object({
  recipient_email: z.email(),
  message_type: z.enum([
    'booking_created',
    'booking_confirmed',
    'booking_cancelled',
    'booking_rescheduled',
    'reminder_24h',
    'reminder_2h',
    'reminder_30min',
    'no_show',
    'provider_schedule_change',
    'custom',
  ]),
  booking_details: z.record(z.string(), z.unknown()).optional().default({}),
  action_links: z.array(
    z.object({
      text: z.string(),
      url: z.url(),
      style: z.enum(['primary', 'secondary', 'danger']).optional().default('primary'),
    })
  ).optional().default([]),
});

export interface ActionLink { readonly text: string; readonly url: string; readonly style: 'primary' | 'secondary' | 'danger' }

export type EmailDetails = Readonly<Record<string, unknown>>;

export interface GmailSendData {
  readonly sent: boolean;
  readonly message_id: string | null;
  readonly recipient_email: string;
  readonly message_type: string;
  readonly subject: string;
}
