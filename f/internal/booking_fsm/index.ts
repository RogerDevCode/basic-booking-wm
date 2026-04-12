/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Public API surface for the booking FSM module
 * DB Tables Used  : None
 * Concurrency Risk: NO
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : YES — re-exports all schemas
 */

// ============================================================================
// BOOKING FSM — Public API
// ============================================================================

// Types & Schemas
export {
  BOOKING_STEP,
  type BookingStepName,
  type BookingState,
  type BookingAction,
  type TransitionResult,
  type DraftBooking,
  VALID_TRANSITIONS,
  BookingStateSchema,
  IdleStateSchema,
  SelectingSpecialtySchema,
  SelectingDoctorSchema,
  SelectingTimeSchema,
  ConfirmingSchema,
  CompletedSchema,
  BookingActionSchema,
  emptyDraft,
} from './types';

// State Machine
export {
  parseAction,
  applyTransition,
  flowStepFromState,
  STEP_TO_FLOW_STEP,
} from './machine';

// Response Templates
export {
  buildSpecialtyPrompt,
  buildDoctorsPrompt,
  buildSlotsPrompt,
  buildConfirmationPrompt,
  buildLoadingDoctorsPrompt,
  buildLoadingSlotsPrompt,
  buildNoSpecialtiesAvailable,
  buildNoDoctorsAvailable,
  buildNoSlotsAvailable,
} from './responses';

// Data Queries
export {
  fetchSpecialties,
  type ServiceRow,
  type FetchSpecialtiesResult,
} from './data-specialties';

export {
  fetchDoctors,
  type ProviderRow,
  type FetchDoctorsResult,
} from './data-doctors';

export {
  fetchSlots,
  type TimeSlot,
  type FetchSlotsResult,
} from './data-slots';
