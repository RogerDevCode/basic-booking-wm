// ============================================================================
// DB TYPES — Strict TypeScript types matching PostgreSQL schema
// ============================================================================
// No `any`, no `as` for DB queries. Every query result is typed.
// postgres library returns untyped rows; we validate with type guards.
// ============================================================================

export type UUID = string & { readonly __brand: unique symbol };

export function isUUID(value: unknown): value is UUID {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function toUUID(value: string): UUID {
  if (!isUUID(value)) {
    throw new Error(`Invalid UUID: ${value}`);
  }
  return value as unknown as UUID; // Type guard validated, safe cast
}

// ─── Provider ───────────────────────────────────────────────────────────────
export interface ProviderRow {
  provider_id: UUID;
  name: string;
  email: string;
  phone: string | null;
  specialty: string;
  telegram_chat_id: string | null;
  gcal_calendar_id: string | null;
  timezone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Service ────────────────────────────────────────────────────────────────
export interface ServiceRow {
  service_id: UUID;
  provider_id: UUID;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  price_cents: number;
  currency: string;
  is_active: boolean;
  created_at: string;
}

// ─── Patient ────────────────────────────────────────────────────────────────
export interface PatientRow {
  patient_id: UUID;
  name: string;
  email: string | null;
  phone: string | null;
  telegram_chat_id: string | null;
  gcal_calendar_id: string | null;
  timezone: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
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
  booking_id: UUID;
  provider_id: UUID;
  patient_id: UUID;
  service_id: UUID;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  idempotency_key: string;
  cancellation_reason: string | null;
  cancelled_by: 'patient' | 'provider' | 'system' | null;
  rescheduled_from: UUID | null;
  rescheduled_to: UUID | null;
  notes: string | null;
  gcal_provider_event_id: string | null;
  gcal_patient_event_id: string | null;
  gcal_sync_status: GCalSyncStatus;
  gcal_retry_count: number;
  gcal_last_sync: string | null;
  notification_sent: boolean;
  reminder_24h_sent: boolean;
  reminder_2h_sent: boolean;
  reminder_30min_sent: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Provider Schedule ──────────────────────────────────────────────────────
export interface ProviderScheduleRow {
  schedule_id: UUID;
  provider_id: UUID;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

// ─── Schedule Override ──────────────────────────────────────────────────────
export interface ScheduleOverrideRow {
  override_id: UUID;
  provider_id: UUID;
  override_date: string;
  is_blocked: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  created_at: string;
}

// ─── Booking Audit ──────────────────────────────────────────────────────────
export interface BookingAuditRow {
  audit_id: UUID;
  booking_id: UUID;
  from_status: BookingStatus | null;
  to_status: BookingStatus;
  changed_by: 'patient' | 'provider' | 'system';
  actor_id: UUID | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ─── Booking with joins (for display/notification) ──────────────────────────
export interface BookingWithDetails {
  booking_id: UUID;
  patient_id: UUID;
  provider_id: UUID;
  service_id: UUID;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  provider_name: string;
  patient_name: string;
  patient_email: string | null;
  patient_telegram_chat_id: string | null;
  service_name: string;
  gcal_provider_event_id: string | null;
  gcal_patient_event_id: string | null;
  gcal_sync_status: GCalSyncStatus;
  gcal_retry_count: number;
  reminder_preferences: Record<string, unknown> | null;
}

// ─── Time Slot ──────────────────────────────────────────────────────────────
export interface TimeSlot {
  start: string; // ISO 8601
  end: string;   // ISO 8601
  available: boolean;
}

// ─── Availability Result ────────────────────────────────────────────────────
export interface AvailabilityResult {
  provider_id: UUID;
  provider_name: string;
  date: string; // YYYY-MM-DD
  timezone: string;
  slots: readonly TimeSlot[];
  total_available: number;
  total_booked: number;
  is_blocked: boolean;
  block_reason: string | null;
}

// ─── Type Guards for DB rows ────────────────────────────────────────────────
export function isBookingStatus(value: unknown): value is BookingStatus {
  if (typeof value !== 'string') return false;
  const valid: readonly BookingStatus[] = [
    'pending', 'confirmed', 'in_service', 'completed',
    'cancelled', 'no_show', 'rescheduled',
  ];
  return (valid as readonly string[]).includes(value);
}

export function isGCalSyncStatus(value: unknown): value is GCalSyncStatus {
  if (typeof value !== 'string') return false;
  const valid: readonly GCalSyncStatus[] = ['pending', 'synced', 'partial', 'failed'];
  return (valid as readonly string[]).includes(value);
}

// Validates a row from the database has the expected shape
export function validateBookingRow(row: Record<string, unknown>): BookingWithDetails | null {
  const bookingId = row['booking_id'];
  const patientId = row['patient_id'];
  const providerId = row['provider_id'];
  const serviceId = row['service_id'];
  const startTime = row['start_time'];
  const endTime = row['end_time'];
  const status = row['status'];
  const providerName = row['provider_name'];
  const patientName = row['patient_name'];
  const serviceName = row['service_name'];

  if (
    typeof bookingId !== 'string' ||
    typeof patientId !== 'string' ||
    typeof providerId !== 'string' ||
    typeof serviceId !== 'string' ||
    typeof startTime !== 'string' ||
    typeof endTime !== 'string' ||
    typeof status !== 'string' ||
    typeof providerName !== 'string' ||
    typeof patientName !== 'string' ||
    typeof serviceName !== 'string'
  ) {
    return null;
  }

  if (!isBookingStatus(status)) return null;

  return {
    booking_id: toUUID(bookingId),
    patient_id: toUUID(patientId),
    provider_id: toUUID(providerId),
    service_id: toUUID(serviceId),
    start_time: startTime,
    end_time: endTime,
    status,
    provider_name: providerName,
    patient_name: patientName,
    patient_email: typeof row['patient_email'] === 'string' ? row['patient_email'] : null,
    patient_telegram_chat_id: typeof row['patient_telegram_chat_id'] === 'string' ? row['patient_telegram_chat_id'] : null,
    service_name: serviceName,
    gcal_provider_event_id: typeof row['gcal_provider_event_id'] === 'string' ? row['gcal_provider_event_id'] : null,
    gcal_patient_event_id: typeof row['gcal_patient_event_id'] === 'string' ? row['gcal_patient_event_id'] : null,
    gcal_sync_status: isGCalSyncStatus(row['gcal_sync_status']) ? row['gcal_sync_status'] : 'pending',
    gcal_retry_count: typeof row['gcal_retry_count'] === 'number' ? row['gcal_retry_count'] : 0,
    reminder_preferences: typeof row['reminder_preferences'] === 'object' && row['reminder_preferences'] !== null
      ? row['reminder_preferences'] as Record<string, unknown>
      : null,
  };
}
