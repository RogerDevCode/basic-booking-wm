/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Routes AI intents to booking actions (create, cancel, reschedule, list)
 * DB Tables Used  : bookings, providers, clients, services, provider_schedules
 * Concurrency Risk: YES — delegates to booking_create/cancel/reschedule which use transactions
 * GCal Calls      : NO — delegates to gcal_sync
 * Idempotency Key : YES — delegates to child scripts
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates all inputs
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - DECOMPOSITION:
 *   1. Validate and normalize input (intent, date, time).
 *   2. Resolve context (tenant_id, client_id, service_id).
 *   3. Route to specific handler using a registry (OCP).
 *   4. Each handler manages its own validation, delegation, and response formatting (SRP).
 *
 * ### Schema Verification
 * - Tables: bookings, providers, clients, services, provider_schedules. Verified against §6.
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Missing data for creation -> Hand off to wizard.
 * - Scenario 2: DB or delegation error -> Return Result with Error.
 * - Scenario 3: Missing tenant context -> Return Error.
 *
 * ### Concurrency Analysis
 * - Risk: YES. Handled via child scripts using transactions and GIST constraints.
 *
 * ### SOLID Architecture Review
 * - SRP: Logic split between main entry, resolvers, and handlers.
 * - OCP: Intent routing uses a map instead of a switch.
 * - DIP: Depends on abstractions (Result type, DB client).
 * - Zero Tolerance: Removed all 'any' usage in favor of type-safe unknown + guards.
 *
 * → CLEARED FOR CODE GENERATION
 */

import { logger } from '../internal/logger/index';
import type { Result } from '../internal/result/index';
import { InputSchema, type InputType, type OrchestratorResult, type OrchestratorBookingIntent } from './types';
import { normalizeIntent } from './normalizeIntent';
import { resolveContext } from './resolveContext';
import { handleCreateBooking } from './handleCreateBooking';
import { handleCancelBooking } from './handleCancelBooking';
import { handleReschedule } from './handleReschedule';
import { handleListAvailable } from './handleListAvailable';
import { handleGetMyBookings } from './handleGetMyBookings';

const MODULE = 'booking_orchestrator';

const HANDLER_MAP: Readonly<Record<OrchestratorBookingIntent, (i: Readonly<InputType>) => Promise<Result<OrchestratorResult>>>> = {
  crear_cita: handleCreateBooking,
  cancelar_cita: handleCancelBooking,
  reagendar_cita: handleReschedule,
  ver_disponibilidad: handleListAvailable,
  mis_citas: handleGetMyBookings,
};

export async function main(
  rawInput: unknown
): Promise<Result<OrchestratorResult>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) return [new Error(`Invalid input: ${parsed.error.message}`), null];

  const input = parsed.data;
  const intent = normalizeIntent(input.intent);
  if (!intent) return [new Error(`Unknown intent: ${input.intent}`), null];

  const [resErr, ctx] = await resolveContext(input);
  if (resErr || !ctx) return [resErr ?? new Error('Context resolution failed'), null];

  const enrichedInput: InputType = {
    ...input,
    tenant_id: ctx.tenantId,
    client_id: ctx.clientId,
    provider_id: ctx.providerId,
    service_id: ctx.serviceId,
    date: ctx.date,
    time: ctx.time,
  };

  const handler = HANDLER_MAP[intent];
  const [execErr, result] = await handler(enrichedInput);

  if (execErr) {
    logger.error(MODULE, 'Orchestration execution failed', execErr);
    return [execErr, null];
  }

  return [null, result];
}