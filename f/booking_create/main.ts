/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Create a new medical appointment (SOLID Refactor)
 * DB Tables Used  : bookings, providers, clients, services, schedule_overrides, provider_schedules, booking_audit
 * Concurrency Risk: YES — GIST exclusion constraint + SELECT FOR UPDATE on provider
 * GCal Calls      : NO — gcal_sync handles async sync after creation
 * Idempotency Key : YES — ON CONFLICT (idempotency_key) handled
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates all inputs
 */

import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import { logger } from '../internal/logger';
import type { Result } from '../internal/result';
import { InputSchema, type Input, type BookingCreated } from './types';
import { fetchBookingContext, checkAvailability, persistBooking } from './services';

export async function main(rawInput: unknown): Promise<Result<BookingCreated>> {
  const MODULE = 'booking_create';

  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    logger.error(MODULE, 'Validation failed', parsed.error);
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }
  const input: Input = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  const sql = createDbClient({ url: dbUrl });

  try {
    const [txErr, txResult] = await withTenantContext<BookingCreated>(
      sql,
      input.provider_id,
      async (tx) => {
        const [ctxErr, context] = await fetchBookingContext(tx, input);
        if (ctxErr !== null || !context) return [ctxErr, null];

        const durationMs = context.service.duration * 60 * 1000;
        const endTime = new Date(input.start_time.getTime() + durationMs);
        const [availErr] = await checkAvailability(tx, input, endTime);
        if (availErr !== null) return [availErr, null];

        return persistBooking(tx, input, context, endTime);
      }
    );

    if (txErr !== null) {
      logger.error(MODULE, 'Transaction failed', txErr, { idempotency_key: input.idempotency_key });
      const msg = txErr.message;
      if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
        return [new Error('A booking with this idempotency key already exists'), null];
      }
      if (msg.includes('booking_no_overlap') || msg.includes('exclusion constraint')) {
        return [new Error('This time slot was just booked. Please choose a different time.'), null];
      }
      return [txErr, null];
    }

    logger.info(MODULE, 'Booking creation complete', { booking_id: txResult?.booking_id });
    return [null, txResult!];

  } catch (e) {
    logger.error(MODULE, 'Unexpected infrastructure error', e);
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      return [new Error('A booking with this idempotency key already exists'), null];
    }
    if (message.includes('booking_no_overlap') || message.includes('exclusion constraint')) {
      return [new Error('This time slot was just booked. Please choose a different time.'), null];
    }
    return [new Error(`Internal error: ${message}`), null];
  } finally {
    await sql.end();
  }
}