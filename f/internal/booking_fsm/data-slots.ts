/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Query available time slots for a doctor on a given date
 * DB Tables Used  : services (service lookup), then delegates to scheduling-engine
 *                   (provider_schedules, schedule_overrides, bookings)
 * Concurrency Risk: NO — read-only query
 * GCal Calls      : NO
 * Idempotency Key : NO — read-only
 * RLS Tenant ID   : YES — query runs within withTenantContext
 * Zod Schemas     : YES — AvailabilityQuery validated inside scheduling-engine
 */

// ============================================================================
// BOOKING FSM — Data: Available Time Slots (thin adapter over scheduling-engine)
// ============================================================================
// T8 — SSOT for slot computation is scheduling-engine/index.ts.
// This module is a pure adapter that:
//   1. Resolves a service_id for the provider (§6-compliant: services.provider_id)
//   2. Delegates to getAvailability() — the authoritative slot computation engine
//   3. Filters to only available slots and maps them to wizard-friendly format
// ============================================================================

import type postgres from 'postgres';
import { getAvailability } from '../scheduling-engine';
import type { Result } from '../result';

// ─── Output types (wizard-compatible, unchanged) ──────────────────────────────

export interface TimeSlot {
  readonly id: string;
  readonly label: string;
  readonly start_time: string;
}

export interface FetchSlotsResult {
  readonly slots: readonly TimeSlot[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Formats an ISO datetime string as a 12-hour AM/PM label for Telegram display.
 * Example: "2026-04-14T10:30:00.000Z" → "10:30 AM"
 * Uses UTC hours/minutes because slot start times are stored as UTC.
 */
function formatSlotLabel(isoStart: string): string {
  const d = new Date(isoStart);
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const minutesStr = minutes.toString().padStart(2, '0');
  return `${displayHours}:${minutesStr} ${ampm}`;
}

/**
 * Resolves the first service_id for a provider using the §6 canonical schema.
 * (services table has provider_id FK — no provider_services junction table in §6)
 */
async function resolveServiceId(
  sql: postgres.Sql,
  providerId: string,
): Promise<Result<string>> {
  try {
    const rows = await sql<{ service_id: string }[]>`
      SELECT service_id
      FROM services
      WHERE provider_id = ${providerId}::uuid
      ORDER BY duration_minutes ASC
      LIMIT 1
    `;

    const serviceId = rows[0]?.service_id ?? null;
    if (serviceId === null) {
      return [new Error(`No services found for provider ${providerId}`), null];
    }

    return [null, serviceId];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`db_query_failed: ${msg}`), null];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * fetchSlots — Returns available time slots for a provider on a given date.
 *
 * Delegates slot computation to the scheduling-engine (SSOT).
 * The sql client must already be inside withTenantContext.
 *
 * @param sql        Postgres client (should be inside withTenantContext)
 * @param providerId UUID of the provider
 * @param date       Target date in YYYY-MM-DD format
 * @param serviceId  Optional service UUID; resolved from provider's services if absent
 */
export async function fetchSlots(
  sql: postgres.Sql,
  providerId: string,
  date: string, // YYYY-MM-DD
  serviceId?: string,
): Promise<Result<FetchSlotsResult>> {
  // 1. Resolve effective service_id
  let effectiveServiceId = serviceId ?? null;
  if (effectiveServiceId === null) {
    const [resolveErr, resolvedId] = await resolveServiceId(sql, providerId);
    if (resolveErr !== null) {
      return [resolveErr, null];
    }
    effectiveServiceId = resolvedId;
  }

  // 2. Delegate to scheduling-engine — the canonical slot computation authority
  const [schedErr, schedResult] = await getAvailability(sql, {
    provider_id: providerId,
    date,
    service_id: effectiveServiceId!,
  });

  if (schedErr !== null) {
    return [schedErr, null];
  }

  if (schedResult === null) {
    return [new Error('unexpected_null_availability'), null];
  }

  // 3. Handle blocked days (wizard handles empty slots gracefully)
  if (schedResult.is_blocked) {
    return [null, { slots: [] }];
  }

  // 4. Transform to wizard format (SRP: mapping logic isolated)
  const availableSlots: TimeSlot[] = schedResult.slots
    .filter((s) => s.available)
    .map((s, index) => ({
      id: String(index + 1),
      label: formatSlotLabel(s.start),
      start_time: s.start,
    }));

  return [null, { slots: availableSlots }];
}
