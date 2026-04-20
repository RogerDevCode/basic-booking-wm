import { z } from 'zod';
import { DEFAULT_TIMEZONE } from '../internal/config/index';

export const InputSchema = z.object({
  dry_run: z.boolean().optional().default(false),
  timezone: z.string().optional().default(DEFAULT_TIMEZONE),
});

export type ReminderWindow = '24h' | '2h' | '30min';

export interface ReminderPrefs {
  readonly telegram_24h?: boolean;
  readonly telegram_2h?: boolean;
  readonly telegram_30min?: boolean;
  readonly email_24h?: boolean;
  readonly email_2h?: boolean;
  readonly email_30min?: boolean;
  readonly [key: string]: unknown;
}

export interface BookingRecord {
  booking_id: string;
  client_id: string;
  provider_id: string;
  start_time: Date;
  end_time: Date;
  status: string;
  reminder_24h_sent: boolean;
  reminder_2h_sent: boolean;
  reminder_30min_sent: boolean;
  client_telegram_chat_id: string | null;
  client_email: string | null;
  client_name: string | null;
  provider_name: string | null;
  service_name: string | null;
  reminder_preferences: ReminderPrefs | null;
}

export interface ScriptResponse {
  readonly success?: boolean;
  readonly error_message?: string | null;
}

export interface CronResult {
  reminders_24h_sent: number;
  reminders_2h_sent: number;
  reminders_30min_sent: number;
  errors: number;
  dry_run: boolean;
  processed_bookings: string[];
}