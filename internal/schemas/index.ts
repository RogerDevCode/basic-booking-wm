import { z } from "zod";
import { BookingID, PatientID, ProviderID, ServiceID } from "../types/domain";

// ============================================================================
// STATUS ENUMS
// ============================================================================

export const BookingStatusSchema = z.enum([
  "pending",
  "confirmed",
  "in_service",
  "completed",
  "cancelled",
  "no_show",
  "rescheduled"
]);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

export const GCalSyncStatusSchema = z.enum([
  "pending",
  "synced",
  "partial",
  "failed"
]);
export type GCalSyncStatus = z.infer<typeof GCalSyncStatusSchema>;

// ============================================================================
// CORE ENTITIES
// ============================================================================

export const BookingSchema = z.object({
  id: z.string().uuid().transform(val => val as BookingID),
  provider_id: z.string().uuid().transform(val => val as ProviderID),
  service_id: z.string().uuid().transform(val => val as ServiceID),
  patient_id: z.string().uuid().transform(val => val as PatientID).nullable(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  status: BookingStatusSchema,
  idempotency_key: z.string().regex(/^[a-zA-Z0-9-]+$/),
  gcal_event_id: z.string().nullable(),
  gcal_provider_event_id: z.string().nullable(),
  gcal_patient_event_id: z.string().nullable(),
  gcal_sync_status: GCalSyncStatusSchema,
  gcal_retry_count: z.number().int().min(0),
  gcal_last_sync: z.string().datetime().nullable(),
  notification_sent: z.boolean(),
  reminder_24h_sent: z.boolean(),
  reminder_2h_sent: z.boolean(),
  rescheduled_from: z.string().uuid().transform(val => val as BookingID).nullable(),
  rescheduled_to: z.string().uuid().transform(val => val as BookingID).nullable(),
  notes: z.string().nullable(),
  user_id: z.string().nullable(), // chat_id
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  cancelled_at: z.string().datetime().nullable(),
  cancellation_reason: z.string().nullable()
}).strict();

export type Booking = z.infer<typeof BookingSchema>;

export const ProviderSchema = z.object({
  id: z.string().uuid().transform(val => val as ProviderID),
  name: z.string().min(1),
  email: z.string().email(),
  specialty: z.string().nullable(),
  phone: z.string().nullable(),
  timezone: z.string(),
  is_active: z.boolean(),
  gcal_calendar_id: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
}).strict();

export type Provider = z.infer<typeof ProviderSchema>;

export const ServiceSchema = z.object({
  id: z.string().uuid().transform(val => val as ServiceID),
  provider_id: z.string().uuid().transform(val => val as ProviderID),
  name: z.string().min(1),
  description: z.string().nullable(),
  duration_minutes: z.number().int().positive(),
  buffer_minutes: z.number().int().min(0),
  min_lead_booking_hours: z.number().int().min(0),
  min_lead_cancel_hours: z.number().int().min(0),
  price: z.number().finite().min(0),
  currency: z.string().length(3),
  is_active: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
}).strict();

export type Service = z.infer<typeof ServiceSchema>;

export const PatientSchema = z.object({
  patient_id: z.string().uuid().transform(val => val as PatientID),
  name: z.string().min(1),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  telegram_chat_id: z.string().nullable(),
  gcal_calendar_id: z.string().nullable(),
  timezone: z.string(),
  metadata: z.record(z.unknown()).nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
}).strict();

export type Patient = z.infer<typeof PatientSchema>;

// ============================================================================
// REQUEST PAYLOADS (FRONTEND / WEBHOOK BOUNDARIES)
// ============================================================================

export const CreateBookingRequestSchema = z.object({
  provider_id: z.string().uuid().transform(val => val as ProviderID),
  service_id: z.string().uuid().transform(val => val as ServiceID),
  start_time: z.string().datetime(),
  chat_id: z.string(),
  user_name: z.string().nullable(),
  user_email: z.string().email().nullable()
}).strict();

export type CreateBookingRequest = z.infer<typeof CreateBookingRequestSchema>;

export const CancelBookingRequestSchema = z.object({
  booking_id: z.string().uuid().transform(val => val as BookingID),
  cancellation_reason: z.string().nullable()
}).strict();

export type CancelBookingRequest = z.infer<typeof CancelBookingRequestSchema>;

export const RescheduleBookingRequestSchema = z.object({
  booking_id: z.string().uuid().transform(val => val as BookingID),
  new_start_time: z.string().datetime()
}).strict();

export type RescheduleBookingRequest = z.infer<typeof RescheduleBookingRequestSchema>;

export const CheckAvailabilityRequestSchema = z.object({
  provider_id: z.string().uuid().transform(val => val as ProviderID),
  service_id: z.string().uuid().transform(val => val as ServiceID),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
}).strict();

export type CheckAvailabilityRequest = z.infer<typeof CheckAvailabilityRequestSchema>;
