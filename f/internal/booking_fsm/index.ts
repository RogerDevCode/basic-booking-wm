/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Public API surface for the booking FSM module (SOLID Refactor)
 * DB Tables Used  : None — barrel file
 * Concurrency Risk: NO
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : YES — re-exports all FSM state/action schemas
 */

/**
 * REASONING TRACE
 * STEP 1 — DECOMPOSITION: Organize re-exports from types, machine, responses, and data layers.
 * STEP 2 — SCHEMA CROSS-CHECK: Checked against §5 FSM and §6 DB schema definitions.
 * STEP 3 — FAILURE MODE ANALYSIS: Ensured all existing exported signatures are preserved to avoid breaking callers.
 * STEP 4 — CONCURRENCY: No shared state in the barrel file.
 * STEP 5 — SOLID ARCHITECTURE:
 *    - SRP: Barrel file now exclusively manages the public interface of the module.
 *    - ISP: Exported members are grouped by domain concern (Types, Engine, UI, Data).
 *    - Facade: Introduced BookingFSM and BookingUI objects to improve discoverability.
 *    - DRY: Centralized exports to prevent duplication of logic across index files.
 */

// ============================================================================
// 1. CORE TYPES & SCHEMAS (SSOT)
// ============================================================================
export {
  BOOKING_STEP,
  type BookingStepName,
  type BookingState,
  type BookingAction,
  type TransitionOutcome,
  type TransitionResult,
  type DraftBooking,
  DraftBookingSchema,
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
  // Type Guards (Newly exported for ISP)
  isNamedItem,
  isTimeItem,
  isNamedItemArray,
  isTimeItemArray,
  isGenericItemArray,
} from './types';

// ============================================================================
// 2. STATE MACHINE ENGINE (SRP)
// ============================================================================
import {
  parseAction,
  applyTransition,
  flowStepFromState,
  STEP_TO_FLOW_STEP,
  parseCallbackData,
} from './machine';

export {
  parseAction,
  applyTransition,
  flowStepFromState,
  STEP_TO_FLOW_STEP,
  parseCallbackData,
};

/**
 * BookingFSM — Engine Facade (SOLID Architecture)
 * Aggregates core state transition logic into a single cohesive unit.
 */
export const BookingFSM = {
  parseAction,
  applyTransition,
  flowStepFromState,
  parseCallbackData,
} as const;

// ============================================================================
// 3. UI COMPONENTS: PROMPTS & KEYBOARDS (OCP)
// ============================================================================
import {
  buildSpecialtyPrompt,
  buildDoctorsPrompt,
  buildSlotsPrompt,
  buildConfirmationPrompt,
  buildLoadingDoctorsPrompt,
  buildLoadingSlotsPrompt,
  buildNoSpecialtiesAvailable,
  buildNoDoctorsAvailable,
  buildNoSlotsAvailable,
  buildSpecialtyKeyboard,
  buildDoctorKeyboard,
  buildTimeSlotKeyboard,
  buildConfirmationKeyboard,
  buildMainMenuKeyboard,
} from './responses';

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
  buildSpecialtyKeyboard,
  buildDoctorKeyboard,
  buildTimeSlotKeyboard,
  buildConfirmationKeyboard,
  buildMainMenuKeyboard,
};

/**
 * BookingUI — Presentation Facade
 * Provides a structured way to access UI building blocks.
 */
export const BookingUI = {
  Prompts: {
    specialty: buildSpecialtyPrompt,
    doctors: buildDoctorsPrompt,
    slots: buildSlotsPrompt,
    confirmation: buildConfirmationPrompt,
    loadingDoctors: buildLoadingDoctorsPrompt,
    loadingSlots: buildLoadingSlotsPrompt,
    noSpecialties: buildNoSpecialtiesAvailable,
    noDoctors: buildNoDoctorsAvailable,
    noSlots: buildNoSlotsAvailable,
  },
  Keyboards: {
    specialty: buildSpecialtyKeyboard,
    doctor: buildDoctorKeyboard,
    timeSlot: buildTimeSlotKeyboard,
    confirmation: buildConfirmationKeyboard,
    mainMenu: buildMainMenuKeyboard,
  },
} as const;

// ============================================================================
// 4. DATA ADAPTERS (DIP)
// ============================================================================
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
