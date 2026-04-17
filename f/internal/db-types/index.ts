// ============================================================================
// DB TYPES — Strict TypeScript types matching PostgreSQL schema
// ============================================================================
// AGENTS.md §1.A.2: NO `as Type` casts. Type guards only.
// postgres library returns untyped rows; we validate with Zod or type guards.
// ============================================================================

import { z } from 'zod';

// ─── UUID Brand Type — validated at runtime, no cast needed ────────────────
export type UUID = string & { readonly __brand: unique symbol };

/**
 * Validates if a value is a valid UUID string.
 * Supports RFC 4122 versions 1-5 and newer versions 6-8.
 */
export function isUUID(value: unknown): value is UUID {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Safely converts a string to a UUID type after validation.
 */
export function toUUID(value: string): UUID | null {
  return isUUID(value) ? value : null;
}

// ─── Shared Constants ──────────────────────────────────────────────────────
export const VALID_BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'in_service',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled',
] as const;

export const VALID_GCAL_SYNC_STATUSES = [
  'pending',
  'synced',
  'partial',
  'failed',
] as const;

// ─── Entities ───────────────────────────────────────────────────────────────

export interface ProviderRow {
  readonly provider_id: UUID;
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly specialty: string;
  readonly telegram_chat_id: string | null;
  readonly gcal_calendar_id: string | null;
  readonly timezone: string;
  readonly is_active: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ServiceRow {
  readonly service_id: UUID;
  readonly provider_id: UUID;
  readonly name: string;
  readonly description: string | null;
  readonly duration_minutes: number;
  readonly buffer_minutes: number;
  readonly price_cents: number;
  readonly currency: string;
  readonly is_active: boolean;
  readonly created_at: string;
}

export interface ClientRow {
  readonly client_id: UUID;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly timezone: string;
  readonly honorific_id: UUID | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export type BookingStatus = (typeof VALID_BOOKING_STATUSES)[number];
export type GCalSyncStatus = (typeof VALID_GCAL_SYNC_STATUSES)[number];

export interface BookingRow {
  readonly booking_id: UUID;
  readonly provider_id: UUID;
  readonly client_id: UUID;
  readonly service_id: UUID;
  readonly start_time: string;
  readonly end_time: string;
  readonly status: BookingStatus;
  readonly idempotency_key: string;
  readonly cancellation_reason: string | null;
  readonly cancelled_by: 'client' | 'provider' | 'system' | null;
  readonly rescheduled_from: UUID | null;
  readonly rescheduled_to: UUID | null;
  readonly notes: string | null;
  readonly gcal_provider_event_id: string | null;
  readonly gcal_client_event_id: string | null;
  readonly gcal_sync_status: GCalSyncStatus;
  readonly gcal_retry_count: number;
  readonly gcal_last_sync: string | null;
  readonly notification_sent: boolean;
  readonly reminder_24h_sent: boolean;
  readonly reminder_2h_sent: boolean;
  readonly reminder_30min_sent: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ProviderScheduleRow {
  readonly id: number;
  readonly provider_id: UUID;
  readonly day_of_week: number;
  readonly start_time: string;
  readonly end_time: string;
}

export interface ScheduleOverrideRow {
  readonly override_id: UUID;
  readonly provider_id: UUID;
  readonly override_date: string;
  readonly is_blocked: boolean;
  readonly start_time: string | null;
  readonly end_time: string | null;
  readonly reason: string | null;
  readonly created_at: string;
}

export interface BookingAuditRow {
  readonly audit_id: UUID;
  readonly booking_id: UUID;
  readonly from_status: BookingStatus | null;
  readonly to_status: BookingStatus;
  readonly changed_by: 'client' | 'provider' | 'system';
  readonly actor_id: UUID | null;
  readonly reason: string | null;
  readonly metadata: Readonly<Record<string, unknown>> | null;
  readonly created_at: string;
}

// ─── Display & Business Types ──────────────────────────────────────────────

export interface BookingWithDetails {
  readonly booking_id: UUID;
  readonly client_id: UUID;
  readonly provider_id: UUID;
  readonly service_id: UUID;
  readonly start_time: string;
  readonly end_time: string;
  readonly status: BookingStatus;
  readonly provider_name: string;
  readonly client_name: string;
  readonly client_email: string | null;
  readonly client_telegram_chat_id: string | null;
  readonly service_name: string;
  readonly gcal_provider_event_id: string | null;
  readonly gcal_client_event_id: string | null;
  readonly gcal_sync_status: GCalSyncStatus;
  readonly gcal_retry_count: number;
  readonly reminder_preferences: Readonly<Record<string, unknown>> | null;
}

export interface TimeSlot {
  readonly start: string; // ISO 8601
  readonly end: string;   // ISO 8601
  readonly available: boolean;
}

export interface AvailabilityResult {
  readonly provider_id: UUID;
  readonly provider_name: string;
  readonly date: string; // YYYY-MM-DD
  readonly timezone: string;
  readonly slots: readonly TimeSlot[];
  readonly total_available: number;
  readonly total_booked: number;
  readonly is_blocked: boolean;
  readonly block_reason: string | null;
}

// ─── Type Guards ───────────────────────────────────────────────────────────

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === 'string' && VALID_BOOKING_STATUSES.some(s => s === value);
}

export function isGCalSyncStatus(value: unknown): value is GCalSyncStatus {
  return typeof value === 'string' && VALID_GCAL_SYNC_STATUSES.some(s => s === value);
}

// ─── Validation Internal Helpers ────────────────────────────────────────────

const uuidSchema = z.custom<UUID>(isUUID);

const BookingWithDetailsSchema = z.object({
  booking_id: uuidSchema,
  client_id: uuidSchema,
  provider_id: uuidSchema,
  service_id: uuidSchema,
  start_time: z.string(),
  end_time: z.string(),
  status: z.enum(VALID_BOOKING_STATUSES),
  provider_name: z.string(),
  client_name: z.string(),
  client_email: z.string().nullable().catch(null),
  client_telegram_chat_id: z.string().nullable().catch(null),
  service_name: z.string(),
  gcal_provider_event_id: z.string().nullable().catch(null),
  gcal_client_event_id: z.string().nullable().catch(null),
  gcal_sync_status: z.enum(VALID_GCAL_SYNC_STATUSES).catch('pending'),
  gcal_retry_count: z.number().catch(0),
  reminder_preferences: z.record(z.string(), z.unknown()).nullable().catch(null),
});

/**
 * Validates a row from the database to match the BookingWithDetails interface.
 * Uses Zod internally for robust, declarative validation.
 */
export function validateBookingRow(row: Readonly<Record<string, unknown>>): BookingWithDetails | null {
  const result = BookingWithDetailsSchema.safeParse(row);
  if (!result.success) return null;
  
  // Ensure the returned object is immutable as per GEMINI.md directives
  return Object.freeze(result.data);
}

