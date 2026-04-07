// ============================================================================
// DB TYPES — Strict TypeScript types matching PostgreSQL schema
// ============================================================================
// AGENTS.md §1.A.2: NO `as Type` casts. Type guards only.
// postgres library returns untyped rows; we validate with type guards.
// ============================================================================

// ─── UUID Brand Type — validated at runtime, no cast needed ────────────────
export type UUID = string & { readonly __brand: unique symbol };

export function isUUID(value: unknown): value is UUID {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// toUUID returns UUID only after validation — no cast, brand is asserted via predicate
export function toUUID(value: string): UUID | null {
  if (!isUUID(value)) return null;
  return value;
}

// ─── Provider ───────────────────────────────────────────────────────────────
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

// ─── Service ────────────────────────────────────────────────────────────────
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

// ─── Client ────────────────────────────────────────────────────────────────
export interface ClientRow {
  readonly client_id: UUID;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly telegram_chat_id: string | null;
  readonly gcal_calendar_id: string | null;
  readonly timezone: string;
  readonly metadata: Readonly<Record<string, unknown>> | null;
  readonly created_at: string;
  readonly updated_at: string;
}

// ─── Booking ────────────────────────────────────────────────────────────────
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'in_service'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

export type GCalSyncStatus = 'pending' | 'synced' | 'partial' | 'failed';

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

// ─── Provider Schedule ──────────────────────────────────────────────────────
export interface ProviderScheduleRow {
  readonly schedule_id: UUID;
  readonly provider_id: UUID;
  readonly day_of_week: number;
  readonly start_time: string;
  readonly end_time: string;
  readonly is_active: boolean;
}

// ─── Schedule Override ──────────────────────────────────────────────────────
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

// ─── Booking Audit ──────────────────────────────────────────────────────────
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

// ─── Booking with joins (for display/notification) ──────────────────────────
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

// ─── Time Slot ──────────────────────────────────────────────────────────────
export interface TimeSlot {
  readonly start: string; // ISO 8601
  readonly end: string;   // ISO 8601
  readonly available: boolean;
}

// ─── Availability Result ────────────────────────────────────────────────────
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

// ─── Type Guards for DB rows — NO casts, pure predicates ────────────────────

const VALID_BOOKING_STATUSES: readonly BookingStatus[] = [
  'pending', 'confirmed', 'in_service', 'completed',
  'cancelled', 'no_show', 'rescheduled',
];

const VALID_GCAL_SYNC_STATUSES: readonly GCalSyncStatus[] = ['pending', 'synced', 'partial', 'failed'];

export function isBookingStatus(value: unknown): value is BookingStatus {
  if (typeof value !== 'string') return false;
  return VALID_BOOKING_STATUSES.includes(value);
}

export function isGCalSyncStatus(value: unknown): value is GCalSyncStatus {
  if (typeof value !== 'string') return false;
  return VALID_GCAL_SYNC_STATUSES.includes(value);
}

// Validates a row from the database has the expected shape.
// Uses type guards exclusively — NO casts.
export function validateBookingRow(row: Readonly<Record<string, unknown>>): BookingWithDetails | null {
  const bookingId = row['booking_id'];
  const clientId = row['client_id'];
  const providerId = row['provider_id'];
  const serviceId = row['service_id'];
  const startTime = row['start_time'];
  const endTime = row['end_time'];
  const status = row['status'];
  const providerName = row['provider_name'];
  const clientName = row['client_name'];
  const serviceName = row['service_name'];

  if (
    typeof bookingId !== 'string' ||
    typeof clientId !== 'string' ||
    typeof providerId !== 'string' ||
    typeof serviceId !== 'string' ||
    typeof startTime !== 'string' ||
    typeof endTime !== 'string' ||
    typeof status !== 'string' ||
    typeof providerName !== 'string' ||
    typeof clientName !== 'string' ||
    typeof serviceName !== 'string'
  ) {
    return null;
  }

  if (!isBookingStatus(status)) return null;

  const bookingUuid = toUUID(bookingId);
  const clientUuid = toUUID(clientId);
  const providerUuid = toUUID(providerId);
  const serviceUuid = toUUID(serviceId);

  if (bookingUuid === null || clientUuid === null || providerUuid === null || serviceUuid === null) {
    return null;
  }

  const gcalSyncStatus = isGCalSyncStatus(row['gcal_sync_status']) ? row['gcal_sync_status'] : 'pending';

  const reminderPrefs = typeof row['reminder_preferences'] === 'object' && row['reminder_preferences'] !== null
    ? row['reminder_preferences']
    : null;

  return {
    booking_id: bookingUuid,
    client_id: clientUuid,
    provider_id: providerUuid,
    service_id: serviceUuid,
    start_time: startTime,
    end_time: endTime,
    status,
    provider_name: providerName,
    client_name: clientName,
    client_email: typeof row['client_email'] === 'string' ? row['client_email'] : null,
    client_telegram_chat_id: typeof row['client_telegram_chat_id'] === 'string' ? row['client_telegram_chat_id'] : null,
    service_name: serviceName,
    gcal_provider_event_id: typeof row['gcal_provider_event_id'] === 'string' ? row['gcal_provider_event_id'] : null,
    gcal_client_event_id: typeof row['gcal_client_event_id'] === 'string' ? row['gcal_client_event_id'] : null,
    gcal_sync_status: gcalSyncStatus,
    gcal_retry_count: typeof row['gcal_retry_count'] === 'number' ? row['gcal_retry_count'] : 0,
    reminder_preferences: reminderPrefs,
  };
}
