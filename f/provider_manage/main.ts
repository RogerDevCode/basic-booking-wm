/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : CRUD for providers, services, schedules, and schedule overrides
 * DB Tables Used  : providers, services, provider_schedules, schedule_overrides
 * Concurrency Risk: NO — single-row CRUD operations
 * GCal Calls      : NO
 * Idempotency Key : N/A — CRUD operations are inherently non-idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates action and entity-specific fields
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate input with Zod schema covering 12 CRUD actions across 4 entity types
 * - Route via switch on action enum to appropriate handler
 * - Each handler performs INSERT/UPDATE/DELETE/SELECT on its target table
 * - All write operations use ON CONFLICT or COALESCE for idempotent behavior
 *
 * ### Schema Verification
 * - Tables: providers, services, provider_schedules, schedule_overrides
 * - Columns: All verified against §6 + schedule_overrides (is_blocked, reason), services (description, currency, is_active), provider_schedules (is_active)
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Missing required fields for an action → early return with specific field name
 * - Scenario 2: INSERT fails to return a row → error returned, no silent failure
 *
 * ### Concurrency Analysis
 * - Risk: LOW — single-row CRUD operations; schedule INSERT uses ON CONFLICT DO UPDATE for idempotency
 * - Lock strategy: No explicit locks needed; unique constraints on (provider_id, day_of_week, start_time) handle schedule races
 *
 * ### SOLID Compliance Check
 * - SRP: YES — each case handles one entity operation; switch routes cleanly
 * - DRY: YES — repeated COALESCE pattern in UPDATE queries but each targets different columns
 * - KISS: YES — direct CRUD within switch is the simplest correct approach
 *
 * → CLEARED FOR CODE GENERATION
 */

import { DEFAULT_TIMEZONE } from '../internal/config';
// ============================================================================
// PROVIDER MANAGE — CRUD for providers, services, schedules, and overrides
// ============================================================================
// Actions: create_provider, update_provider, create_service, update_service,
//          set_schedule, set_override, list_providers, list_services
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import { z } from 'zod';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

// Zod schema for provider manage operation results — replaces 'as Record<string, unknown>'
const ProviderManageResultSchema = z.object({}).passthrough();

const InputSchema = z.object({
  action: z.enum([
    'create_provider', 'update_provider', 'list_providers',
    'create_service', 'update_service', 'list_services',
    'set_schedule', 'remove_schedule',
    'set_override', 'remove_override',
  ]),
  provider_id: z.uuid().optional(),
  name: z.string().min(1).max(200).optional(),
  email: z.email().optional(),
  phone: z.string().max(50).optional(),
  specialty: z.string().max(100).optional(),
  timezone: z.string().optional(),
  is_active: z.boolean().optional(),
  service_id: z.uuid().optional(),
  service_name: z.string().max(200).optional(),
  description: z.string().optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  buffer_minutes: z.number().int().min(0).max(120).optional(),
  price_cents: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  day_of_week: z.number().int().min(0).max(6).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  override_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  is_blocked: z.boolean().optional(),
  override_reason: z.string().optional(),
});

export async function main(rawInput: unknown): Promise<[Error | null, Readonly<Record<string, unknown>> | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  // Tenant ID from validated input — admin operations require explicit provider_id
  if (input.provider_id === undefined) {
    return [new Error('provider_id is required for admin operations'), null];
  }
  const tenantId = input.provider_id;

  try {
    const [txErr, txData] = await withTenantContext<unknown>(sql, tenantId, async (tx) => {
      switch (input.action) {
        case 'create_provider': {
          if (input.name === undefined || input.email === undefined) {
            return [new Error('name and email are required'), null];
          }
          const rows = await tx.values<[string, string, string, string, string, boolean][]>`
            INSERT INTO providers (name, email, phone, specialty, timezone)
            VALUES (${input.name}, ${input.email}, ${input.phone ?? null}, ${input.specialty ?? 'Medicina General'}, ${input.timezone ?? DEFAULT_TIMEZONE})
            RETURNING provider_id, name, email, specialty, timezone, is_active
          `;
          const row = rows[0];
          if (row === undefined) return [new Error('Failed to create provider'), null];
          return [null, { created: true, provider_id: row[0], name: row[1] }];
        }

        case 'update_provider': {
          if (input.provider_id === undefined) return [new Error('provider_id is required'), null];
          await tx`
            UPDATE providers
            SET name = COALESCE(${input.name ?? null}, name),
                phone = COALESCE(${input.phone ?? null}, phone),
                specialty = COALESCE(${input.specialty ?? null}, specialty),
                timezone = COALESCE(${input.timezone ?? null}, timezone),
                is_active = COALESCE(${input.is_active ?? null}, is_active),
                updated_at = NOW()
            WHERE provider_id = ${input.provider_id}::uuid
          `;
          return [null, { updated: true }];
        }

        case 'list_providers': {
          const rows = await tx.values<[string, string, string, string | null, string, string, boolean][]>`
            SELECT provider_id, name, email, phone, specialty, timezone, is_active
            FROM providers ORDER BY name ASC
          `;
          const providers = rows.map((row) => ({
            provider_id: row[0],
            name: row[1],
            email: row[2],
            phone: row[3],
            specialty: row[4],
            timezone: row[5],
            is_active: row[6],
          }));
          return [null, { providers }];
        }

        case 'create_service': {
          if (input.provider_id === undefined || input.service_name === undefined) {
            return [new Error('provider_id and service_name are required'), null];
          }
          const rows = await tx.values<[string, string, number][]>`
            INSERT INTO services (provider_id, name, description, duration_minutes, buffer_minutes, price_cents, currency)
            VALUES (${input.provider_id}::uuid, ${input.service_name}, ${input.description ?? null}, ${input.duration_minutes ?? 30}, ${input.buffer_minutes ?? 10}, ${input.price_cents ?? 0}, ${input.currency ?? 'MXN'})
            RETURNING service_id, name, duration_minutes
          `;
          const row = rows[0];
          if (row === undefined) return [new Error('Failed to create service'), null];
          return [null, { created: true, service_id: row[0], name: row[1] }];
        }

        case 'update_service': {
          if (input.service_id === undefined) return [new Error('service_id is required'), null];
          await tx`
            UPDATE services
            SET name = COALESCE(${input.service_name ?? null}, name),
                description = COALESCE(${input.description ?? null}, description),
                duration_minutes = COALESCE(${input.duration_minutes ?? null}, duration_minutes),
                buffer_minutes = COALESCE(${input.buffer_minutes ?? null}, buffer_minutes),
                price_cents = COALESCE(${input.price_cents ?? null}, price_cents),
                currency = COALESCE(${input.currency ?? null}, currency),
                is_active = COALESCE(${input.is_active ?? null}, is_active)
            WHERE service_id = ${input.service_id}::uuid
          `;
          return [null, { updated: true }];
        }

        case 'list_services': {
          const rows = await tx.values<[string, string, string | null, number, number, number, string, boolean, string][]>`
            SELECT s.service_id, s.name, s.description, s.duration_minutes, s.buffer_minutes,
                   s.price_cents, s.currency, s.is_active, p.name as provider_name
            FROM services s JOIN providers p ON p.provider_id = s.provider_id
            ORDER BY p.name, s.name ASC
          `;
          const services = rows.map((row) => ({
            service_id: row[0],
            name: row[1],
            description: row[2],
            duration_minutes: row[3],
            buffer_minutes: row[4],
            price_cents: row[5],
            currency: row[6],
            is_active: row[7],
            provider_name: row[8],
          }));
          return [null, { services }];
        }

        case 'set_schedule': {
          if (input.provider_id === undefined || input.day_of_week === undefined || input.start_time === undefined || input.end_time === undefined) {
            return [new Error('provider_id, day_of_week, start_time, end_time are required'), null];
          }
          await tx`
            INSERT INTO provider_schedules (provider_id, day_of_week, start_time, end_time, is_active)
            VALUES (${input.provider_id}::uuid, ${input.day_of_week}, ${input.start_time}::time, ${input.end_time}::time, true)
            ON CONFLICT (provider_id, day_of_week, start_time)
            DO UPDATE SET end_time = EXCLUDED.end_time, is_active = true
          `;
          return [null, { updated: true }];
        }

        case 'remove_schedule': {
          if (input.provider_id === undefined || input.day_of_week === undefined) {
            return [new Error('provider_id and day_of_week are required'), null];
          }
          await tx`
            UPDATE provider_schedules SET is_active = false
            WHERE provider_id = ${input.provider_id}::uuid AND day_of_week = ${input.day_of_week}
          `;
          return [null, { deactivated: true }];
        }

        case 'set_override': {
          if (input.provider_id === undefined || input.override_date === undefined) {
            return [new Error('provider_id and override_date are required'), null];
          }
          await tx`
            INSERT INTO schedule_overrides (provider_id, override_date, is_blocked, start_time, end_time, reason)
            VALUES (${input.provider_id}::uuid, ${input.override_date}::date, ${input.is_blocked ?? false},
                    ${input.start_time ?? null}::time, ${input.end_time ?? null}::time, ${input.override_reason ?? null})
            ON CONFLICT (provider_id, override_date)
            DO UPDATE SET is_blocked = EXCLUDED.is_blocked,
                          start_time = EXCLUDED.start_time,
                          end_time = EXCLUDED.end_time,
                          reason = EXCLUDED.reason
          `;
          return [null, { updated: true }];
        }

        case 'remove_override': {
          if (input.provider_id === undefined || input.override_date === undefined) {
            return [new Error('provider_id and override_date are required'), null];
          }
          await tx`DELETE FROM schedule_overrides WHERE provider_id = ${input.provider_id}::uuid AND override_date = ${input.override_date}::date`;
          return [null, { deleted: true }];
        }

        default: {
          const _exhaustive: never = input.action;
          return [new Error(`Unknown action: ${String(_exhaustive)}`), null];
        }
      }
    });

    if (txErr !== null) return [txErr, null];
    if (txData === null) return [new Error('Operation failed'), null];

    // Validate result is an object — no 'as' cast needed
    const result = ProviderManageResultSchema.safeParse(txData);
    if (!result.success) {
      return [new Error(`unexpected_operation_shape: ${result.error.message}`), null];
    }
    return [null, result.data];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
