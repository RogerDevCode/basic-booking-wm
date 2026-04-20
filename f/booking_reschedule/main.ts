/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Cancel old booking + create new one atomically (reschedule)
 * DB Tables Used  : bookings, booking_audit, providers, clients, services
 * Concurrency Risk: YES — full transaction with SELECT FOR UPDATE + GIST constraint
 * GCal Calls      : NO — gcal_sync handles async sync after reschedule
 * Idempotency Key : YES — new booking uses `reschedule-{old_key}-{timestamp}`
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates all inputs
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate input using Zod InputSchema.
 * - Decompose logic into:
 *   - fetchBooking: Read existing booking and validate types.
 *   - fetchService: Read service details (duration).
 *   - authorize: Verify actor permissions.
 *   - executeRescheduleTransaction: Perform atomic DB writes (INSERT + UPDATE + AUDITS).
 * - Orchestrate these in the main entry point.
 *
 * ### Schema Verification
 * - Tables: bookings, services, booking_audit.
 * - Columns: Matches §6 schema and confirmed DB structure.
 *
 * ### Failure Mode Analysis
 * - Handled via Result<T> tuples (Go-style).
 * - Rollback ensured via withTenantContext/BEGIN-COMMIT.
 * - Slot conflict returns user-friendly error.
 *
 * ### SOLID Compliance Check
 * - SRP: Orchestration (main) separated from DB access (fetch functions) and logic (authorize).
 * - DRY: Utilizes shared internal/result, state-machine, and db-types.
 * - KISS: Explicit, linear flow with clear error propagation.
 * - DIP: Depends on DBClient and shared Result abstractions.
 *
 * → CLEARED FOR EXECUTION
 */

import { createDbClient } from '../internal/db/client';
import { logger } from '../internal/logger/index';
import type { Result } from '../internal/result/index';
import { validateTransition } from '../internal/state-machine/index';
import { authorize } from "./authorize";
import { executeReschedule } from "./executeReschedule";
import { fetchBooking } from "./fetchBooking";
import { fetchService } from "./fetchService";
import { type Input, InputSchema, type RescheduleResult } from "./types";

// --- Input Validation ---
// --- Output Types ---
// --- Repository: Read Operations (SRP) ---
// --- Domain Logic: Authorization (SRP) ---
// --- Command Logic: Atomic Transaction (SOLID) ---
// --- Main entry point (Windmill Handler) ---

export async function main(rawInput: unknown): Promise<Result<RescheduleResult>> {
  const MODULE = 'booking_reschedule';

  // 1. Input Validation
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    logger.error(MODULE, 'Validation failed', parsed.error);
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }
  const input: Input = parsed.data;

  // 2. Resource Setup
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) return [new Error('DATABASE_URL is required'), null];
  const sql = createDbClient({ url: dbUrl });

  try {
    // 3. Dependency Retrieval
    const [fetchErr, oldBooking] = await fetchBooking(sql, input.booking_id);
    if (fetchErr || !oldBooking) return [fetchErr ?? new Error('Booking not found'), null];

    const serviceId = input.new_service_id ?? oldBooking.service_id;
    const [svcErr, service] = await fetchService(sql, serviceId);
    if (svcErr || !service) return [svcErr ?? new Error('Service not found'), null];

    // 4. Policy Checks
    const [transitionErr] = validateTransition(oldBooking.status, 'rescheduled');
    if (transitionErr) return [transitionErr, null];

    const [authErr] = authorize(input, oldBooking);
    if (authErr) return [authErr, null];

    // 5. Execution
    const [txErr, write] = await executeReschedule(sql, input, oldBooking, service);
    if (txErr || !write) {
      logger.error(MODULE, 'Reschedule failed', txErr, { booking_id: input.booking_id });
      const msg = txErr?.message ?? 'Transaction error';
      // Specific error mapping for overlap/constraint violations
      if (msg.includes('duplicate') || msg.includes('unique')) return [new Error('Idempotency conflict'), null];
      if (msg.includes('overlap') || msg.includes('exclusion')) return [new Error('Slot already occupied'), null];
      return [txErr ?? new Error(msg), null];
    }

    // 6. Response Construction
    const result: RescheduleResult = {
      old_booking_id: write.old_booking_id,
      new_booking_id: write.new_booking_id,
      old_status: write.old_status,
      new_status: write.new_status,
      old_start_time: oldBooking.start_time,
      new_start_time: write.new_start_time,
      new_end_time: write.new_end_time,
    };

    logger.info(MODULE, 'Booking rescheduled successfully', {
      old: result.old_booking_id,
      new: result.new_booking_id
    });

    return [null, result];
  } catch (err) {
    logger.error(MODULE, 'Unexpected fatal error', err);
    return [err instanceof Error ? err : new Error(String(err)), null];
  } finally {
    await sql.end();
  }
}

