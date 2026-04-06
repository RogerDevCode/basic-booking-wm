// ============================================================================
// CONFIG — Single Source of Truth for all constants and configuration
// ============================================================================
// All magic numbers, timeouts, defaults, and limits live here.
// No hardcoded values anywhere else in the codebase.
// ============================================================================

// ─── Retry Configuration ───────────────────────────────────────────────────
export const MAX_RETRIES = 3;
export const RETRY_BACKOFF_BASE_MS = 1000;
export const RETRY_BACKOFF_MULTIPLIER = 3; // 1s, 3s, 9s
export const MAX_GCAL_RETRIES = 10; // Reconciliation cron max attempts

// ─── Timeout Configuration ─────────────────────────────────────────────────
export const TIMEOUT_GCAL_API_MS = 15000;
export const TIMEOUT_TELEGRAM_API_MS = 10000;
export const TIMEOUT_TELEGRAM_CALLBACK_MS = 5000;
export const TIMEOUT_GMAIL_API_MS = 15000;
export const TIMEOUT_DB_QUERY_MS = 30000;

// ─── Input Limits ──────────────────────────────────────────────────────────
export const MAX_INPUT_LENGTH = 500;
export const MAX_LLM_RESPONSE_LENGTH = 2000;
export const MAX_FOLLOW_UP_LENGTH = 200;
export const MAX_TELEGRAM_CALLBACK_DATA_BYTES = 64;
export const MAX_CANCELLATION_REASON_LENGTH = 500;

// ─── Booking Limits ────────────────────────────────────────────────────────
export const MAX_BOOKINGS_PER_QUERY = 20;
export const MAX_SLOTS_DISPLAYED = 10;
export const DEFAULT_SERVICE_DURATION_MIN = 30;
export const DEFAULT_BUFFER_TIME_MIN = 10;

// ─── Reminder Windows (relative to appointment start) ──────────────────────
// Each window is +/- the specified minutes from the appointment start time
export const REMINDER_24H_WINDOW_START_MIN = 23 * 60; // 23h before
export const REMINDER_24H_WINDOW_END_MIN = 25 * 60;   // 25h before
export const REMINDER_2H_WINDOW_START_MIN = 110;       // 1h50m before
export const REMINDER_2H_WINDOW_END_MIN = 130;         // 2h10m before
export const REMINDER_30MIN_WINDOW_START_MIN = 25;     // 25m before
export const REMINDER_30MIN_WINDOW_END_MIN = 35;       // 35m before

// ─── GCal Configuration ────────────────────────────────────────────────────
export const GCAL_BASE_URL = 'https://www.googleapis.com/calendar/v3';
export const GCAL_REMINDER_24H_MIN = 1440;
export const GCAL_REMINDER_2H_MIN = 120;
export const GCAL_REMINDER_30MIN_MIN = 30;
export const GCAL_WEBHOOK_EXPIRATION_DAYS = 7;

// ─── Status Constants ──────────────────────────────────────────────────────
export const BOOKING_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  IN_SERVICE: 'in_service',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
  RESCHEDULED: 'rescheduled',
} as const;

export const CANCELLABLE_STATUSES = [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED];
export const RESCHEDULABLE_STATUSES = [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED];
export const TERMINAL_STATUSES = [
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.NO_SHOW,
  BOOKING_STATUS.RESCHEDULED,
];

export const GCAL_SYNC_STATUS = {
  PENDING: 'pending',
  SYNCED: 'synced',
  PARTIAL: 'partial',
  FAILED: 'failed',
} as const;

// ─── Actor Constants ───────────────────────────────────────────────────────
export const ACTOR = {
  PATIENT: 'client',
  PROVIDER: 'provider',
  SYSTEM: 'system',
} as const;

// ─── Channel Constants ─────────────────────────────────────────────────────
export const CHANNEL = {
  TELEGRAM: 'telegram',
  WEB: 'web',
  API: 'api',
} as const;

// ─── Intent Constants ──────────────────────────────────────────────────────
export const INTENT = {
  CREATE_BOOKING: 'create_booking',
  CANCEL_BOOKING: 'cancel_booking',
  RESCHEDULE: 'reschedule',
  LIST_AVAILABLE: 'list_available',
  GET_MY_BOOKINGS: 'get_my_bookings',
  GENERAL_QUESTION: 'general_question',
  GREETING: 'greeting',
  UNKNOWN: 'unknown',
} as const;

// ─── Fail-Fast Configuration Validation ────────────────────────────────────
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`CONFIGURATION_ERROR: Required environment variable ${name} is not set. This is a fatal configuration error.`);
  }
  return value;
}

export function requireDatabaseUrl(): string {
  return requireEnv('DATABASE_URL');
}

export function requireTelegramBotToken(): string {
  return requireEnv('TELEGRAM_BOT_TOKEN');
}

export function requireGCalAccessToken(): string {
  return requireEnv('GCAL_ACCESS_TOKEN');
}

export function requireGmailCredentials(): { user: string; pass: string } {
  const user = process.env['GMAIL_USER'];
  const pass = process.env['GMAIL_PASSWORD'];
  if (!user || !pass) {
    throw new Error('CONFIGURATION_ERROR: GMAIL_USER and GMAIL_PASSWORD are required. Dev fallback credentials are not permitted in production.');
  }
  return { user, pass };
}

export function getOptionalEnv(name: string, defaultValue?: string): string | undefined {
  return process.env[name] ?? defaultValue;
}
