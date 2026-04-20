// ============================================================================
// CONFIG — Single Source of Truth for all constants and configuration
// ============================================================================
// All magic numbers, timeouts, defaults, and limits live here.
// No hardcoded values anywhere else in the codebase.
//
// AGENTS.md §1.A.3: NO throw for control flow.
// AGENTS.md §5.3: Retry policy = 500ms * 2^attempt (not 1000ms * 3^attempt).
// ============================================================================

import type { Result } from '../result/index';
export type { Result } from '../result/index';

// ─── Retry Configuration — AGENTS.md §5.3 compliant ───────────────────────
// Base: 500ms, multiplier: 2 → 500ms, 1000ms, 2000ms, 4000ms, ...
export const MAX_RETRIES = 3;
export const RETRY_BACKOFF_BASE_MS = 500;
export const RETRY_BACKOFF_MULTIPLIER = 2;
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

// ─── Intent Constants — Spanish vocabulary per AGENTS.md §5.1 ──────────────
export const INTENT = {
  CREAR_CITA: 'crear_cita',
  CANCELAR_CITA: 'cancelar_cita',
  REAGENDAR_CITA: 'reagendar_cita',
  VER_DISPONIBILIDAD: 'ver_disponibilidad',
  MIS_CITAS: 'mis_citas',
  DUDA_GENERAL: 'duda_general',
  FUERA_DE_CONTEXTO: 'fuera_de_contexto',
  DESCONOCIDO: 'desconocido',
} as const;

// ─── Fail-Fast Configuration Validation — AGENTS.md §1.A.3 compliant ──────
// NO throw. Returns Result<string> so caller handles missing env explicitly.

export function requireEnv(name: string): Result<string> {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    return [
      new Error(`CONFIGURATION_ERROR: Required environment variable ${name} is not set. This is a fatal configuration error.`),
      null,
    ];
  }
  return [null, value];
}

export function requireDatabaseUrl(): Result<string> {
  return requireEnv('DATABASE_URL');
}

export function requireTelegramBotToken(): Result<string> {
  return requireEnv('TELEGRAM_BOT_TOKEN');
}

export function requireGCalAccessToken(): Result<string> {
  return requireEnv('GCAL_ACCESS_TOKEN');
}

export function requireGmailCredentials(): Result<{ readonly user: string; readonly pass: string }> {
  const user = process.env['GMAIL_USER'];
  const pass = process.env['GMAIL_PASSWORD'];
  if (!user || !pass) {
    return [
      new Error('CONFIGURATION_ERROR: GMAIL_USER and GMAIL_PASSWORD are required. Dev fallback credentials are not permitted in production.'),
      null,
    ];
  }
  return [null, { user, pass }];
}

export function getOptionalEnv(name: string, defaultValue?: string): string | undefined {
  return process.env[name] ?? defaultValue;
}

// ─── Default Values — AGENTS.md §2.1: No hardcoded magic values ───────────
// REMOVED: NULL_TENANT_UUID — sentinel values violate RLS guarantees (AGENTS.md §7)
// All callers must use explicit tenant IDs from authenticated session context.
export const DEFAULT_TIMEZONE = 'America/Mexico_City';
export const DEFAULT_SPECIALTY_PROVIDER = 'Medicina General';
export const DEFAULT_TAG_COLOR = '#808080';
export const DEFAULT_SORT_ORDER = 99;
export const DEFAULT_PASSWORD_LENGTH = 4;
export const DEFAULT_LIMIT = 100;
export const LIMIT_50 = 50;
export const LIMIT_200 = 200;
export const TELEGRAM_PARSE_MODE = 'Markdown';
export const DEFAULT_CATEGORY = 'Medicina';
