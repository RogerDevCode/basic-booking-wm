/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Define FSM types and schemas for the booking wizard
 * DB Tables Used  : None — pure type definitions
 * Concurrency Risk: NO
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : YES — all FSM state schemas validated
 */

// ============================================================================
// BOOKING FSM — Types and Schemas
// ============================================================================

import { z } from 'zod';

// ============================================================================
// Step Names (discriminant)
// ============================================================================

export const BOOKING_STEP = {
  IDLE: 'idle',
  SELECTING_SPECIALTY: 'selecting_specialty',
  SELECTING_DOCTOR: 'selecting_doctor',
  SELECTING_TIME: 'selecting_time',
  CONFIRMING: 'confirming',
  COMPLETED: 'completed',
} as const;

export type BookingStepName = (typeof BOOKING_STEP)[keyof typeof BOOKING_STEP];

// ============================================================================
// State schemas
// ============================================================================

export const IdleStateSchema = z.object({
  name: z.literal(BOOKING_STEP.IDLE),
}).readonly();

export const SelectingSpecialtySchema = z.object({
  name: z.literal(BOOKING_STEP.SELECTING_SPECIALTY),
  error: z.string().nullable().default(null),
  items: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
}).readonly();

export const SelectingDoctorSchema = z.object({
  name: z.literal(BOOKING_STEP.SELECTING_DOCTOR),
  specialtyId: z.string(),
  specialtyName: z.string(),
  error: z.string().nullable().default(null),
  items: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
}).readonly();

export const SelectingTimeSchema = z.object({
  name: z.literal(BOOKING_STEP.SELECTING_TIME),
  specialtyId: z.string(),
  doctorId: z.string(),
  doctorName: z.string(),
  error: z.string().nullable().default(null),
  items: z.array(z.object({ id: z.string(), label: z.string(), start_time: z.string() })).default([]),
}).readonly();

export const ConfirmingSchema = z.object({
  name: z.literal(BOOKING_STEP.CONFIRMING),
  specialtyId: z.string(),
  doctorId: z.string(),
  doctorName: z.string(),
  timeSlot: z.string(),
  draft: z.object({
    specialty_id: z.string().nullable(),
    doctor_id: z.string().nullable(),
    start_time: z.string().nullable(),
    time_label: z.string().nullable(),
    client_id: z.string().nullable().default(null),
  }),
}).readonly();

export const CompletedSchema = z.object({
  name: z.literal(BOOKING_STEP.COMPLETED),
  bookingId: z.string(),
}).readonly();

// ============================================================================
// Discriminated Union — full booking state
// ============================================================================

export const BookingStateSchema = z.discriminatedUnion('name', [
  IdleStateSchema,
  SelectingSpecialtySchema,
  SelectingDoctorSchema,
  SelectingTimeSchema,
  ConfirmingSchema,
  CompletedSchema,
]);

export type BookingState = z.infer<typeof BookingStateSchema>;

// ============================================================================
// FSM Actions
// ============================================================================

export const BookingActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('select'), value: z.string() }),
  z.object({ type: z.literal('back') }),
  z.object({ type: z.literal('cancel') }),
  z.object({ type: z.literal('confirm_yes') }),
  z.object({ type: z.literal('confirm_no') }),
]);

export type BookingAction = z.infer<typeof BookingActionSchema>;

// ============================================================================
// FSM Transition Result
// ============================================================================

export type TransitionResult =
  | { ok: true; nextState: BookingState; responseText: string; advance: boolean }
  | { ok: false; nextState: BookingState; responseText: string; advance: false };

// ============================================================================
// Valid transitions map
// ============================================================================

export const VALID_TRANSITIONS: Readonly<Record<BookingStepName, readonly BookingStepName[]>> = {
  idle: ['selecting_specialty'],
  selecting_specialty: ['selecting_doctor', 'idle'],
  selecting_doctor: ['selecting_time', 'selecting_specialty'],
  selecting_time: ['confirming', 'selecting_doctor'],
  confirming: ['completed', 'selecting_time'],
  completed: ['idle'],
} as const;

// ============================================================================
// Draft Booking — accumulated data across steps
// ============================================================================

export interface DraftBooking {
  readonly specialty_id: string | null;
  readonly specialty_name: string | null;
  readonly doctor_id: string | null;
  readonly doctor_name: string | null;
  readonly start_time: string | null;
  readonly time_label: string | null;
  readonly client_id: string | null;
}

export function emptyDraft(): DraftBooking {
  return Object.freeze({
    specialty_id: null,
    specialty_name: null,
    doctor_id: null,
    doctor_name: null,
    start_time: null,
    time_label: null,
    client_id: null,
  });
}
