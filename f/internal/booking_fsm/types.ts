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

import { z } from 'zod';
import type { Result } from '../result/index.ts';

// ============================================================================
// CONSTANTS & STEP NAMES (SSOT)
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
// BASE SCHEMAS (DRY)
// ============================================================================

const ErrorSchema = z.string().nullable().default(null);

const ItemBaseSchema = z.object({
  id: z.string(),
});

const NamedItemSchema = ItemBaseSchema.extend({
  name: z.string(),
});

const TimeSlotItemSchema = ItemBaseSchema.extend({
  label: z.string(),
  start_time: z.string(),
});

// ============================================================================
// DRAFT SCHEMAS (SSOT)
// ============================================================================

/**
 * Core data fields shared between confirming state and full draft
 */
const DraftCoreSchema = z.object({
  specialty_id: z.string().nullable(),
  specialty_name: z.string().nullable(),
  doctor_id: z.string().nullable(),
  doctor_name: z.string().nullable(),
  start_time: z.string().nullable(),
  time_label: z.string().nullable(),
  client_id: z.string().nullable().default(null),
});

// ============================================================================
// STATE SCHEMAS
// ============================================================================

export const IdleStateSchema = z.object({
  name: z.literal(BOOKING_STEP.IDLE),
});

export const SelectingSpecialtySchema = z.object({
  name: z.literal(BOOKING_STEP.SELECTING_SPECIALTY),
  error: ErrorSchema,
  items: z.array(NamedItemSchema).default([]),
});

export const SelectingDoctorSchema = z.object({
  name: z.literal(BOOKING_STEP.SELECTING_DOCTOR),
  specialtyId: z.string(),
  specialtyName: z.string(),
  error: ErrorSchema,
  items: z.array(NamedItemSchema).default([]),
});

export const SelectingTimeSchema = z.object({
  name: z.literal(BOOKING_STEP.SELECTING_TIME),
  specialtyId: z.string(),
  doctorId: z.string(),
  doctorName: z.string(),
  targetDate: z.string().nullable().default(null),
  error: ErrorSchema,
  items: z.array(TimeSlotItemSchema).default([]),
});

export const ConfirmingSchema = z.object({
  name: z.literal(BOOKING_STEP.CONFIRMING),
  specialtyId: z.string(),
  doctorId: z.string(),
  doctorName: z.string(),
  timeSlot: z.string(),
  draft: DraftCoreSchema,
});

export const CompletedSchema = z.object({
  name: z.literal(BOOKING_STEP.COMPLETED),
  bookingId: z.string(),
});

// ============================================================================
// FULL BOOKING STATE (Discriminated Union)
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
// FSM ACTIONS
// ============================================================================

export const BookingActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('select'), value: z.string() }),
  z.object({ type: z.literal('select_date'), value: z.string() }),
  z.object({ type: z.literal('back') }),
  z.object({ type: z.literal('cancel') }),
  z.object({ type: z.literal('confirm_yes') }),
  z.object({ type: z.literal('confirm_no') }),
]);

export type BookingAction = z.infer<typeof BookingActionSchema>;

// ============================================================================
// FSM TRANSITION RESULT (Go-style tuple per AGENTS.md §4)
// ============================================================================

/**
 * Outcome of a state transition
 */
export interface TransitionOutcome {
  readonly nextState: BookingState;
  readonly responseText: string;
  readonly advance: boolean;
}

/**
 * Result of a transition attempt.
 * Using Result tuple instead of tagged union to comply with GEMINI.md §12.1.
 */
export type TransitionResult = Result<TransitionOutcome>;

// ============================================================================
// VALID TRANSITIONS MAP
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
// DRAFT BOOKING — Accumulated data across steps
// ============================================================================

export const DraftBookingSchema = DraftCoreSchema.extend({
  target_date: z.string().nullable(),
  provider_id: z.string().optional(),
  service_id: z.string().optional(),
  _lastState: z.lazy(() => BookingStateSchema).optional(),
}).readonly();

export type DraftBooking = z.infer<typeof DraftBookingSchema>;

export function emptyDraft(): DraftBooking {
  return Object.freeze({
    specialty_id: null,
    specialty_name: null,
    doctor_id: null,
    doctor_name: null,
    target_date: null,
    start_time: null,
    time_label: null,
    client_id: null,
  });
}

// ============================================================================
// TYPE GUARDS (Zod-based, no 'as' casts)
// ============================================================================

export function isNamedItem(item: unknown): item is z.infer<typeof NamedItemSchema> {
  return NamedItemSchema.safeParse(item).success;
}

export function isTimeItem(item: unknown): item is z.infer<typeof TimeSlotItemSchema> {
  return TimeSlotItemSchema.safeParse(item).success;
}

export function isNamedItemArray(items: unknown): items is z.infer<typeof NamedItemSchema>[] {
  return z.array(NamedItemSchema).safeParse(items).success;
}

export function isTimeItemArray(items: unknown): items is z.infer<typeof TimeSlotItemSchema>[] {
  return z.array(TimeSlotItemSchema).safeParse(items).success;
}

export function isGenericItemArray(items: unknown): items is { id: string; name?: string; label?: string; start_time?: string }[] {
  const GenericItemSchema = ItemBaseSchema.extend({
    name: z.string().optional(),
    label: z.string().optional(),
    start_time: z.string().optional(),
  });
  return z.array(GenericItemSchema).safeParse(items).success;
}
