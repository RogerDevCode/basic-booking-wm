// ============================================================================
// PROVIDER MANAGE — CRUD for providers, services, schedules, and overrides
// ============================================================================
// Actions: create_provider, update_provider, create_service, update_service,
//          set_schedule, set_override, list_providers, list_services
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  action: z.enum([
    'create_provider', 'update_provider', 'list_providers',
    'create_service', 'update_service', 'list_services',
    'set_schedule', 'remove_schedule',
    'set_override', 'remove_override',
  ]),
  // Provider fields
  provider_id: z.string().uuid().optional(),
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  specialty: z.string().max(100).optional(),
  timezone: z.string().optional(),
  is_active: z.boolean().optional(),
  // Service fields
  service_id: z.string().uuid().optional(),
  service_name: z.string().max(200).optional(),
  description: z.string().optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  buffer_minutes: z.number().int().min(0).max(120).optional(),
  price_cents: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  // Schedule fields
  day_of_week: z.number().int().min(0).max(6).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  // Override fields
  override_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  is_blocked: z.boolean().optional(),
  override_reason: z.string().optional(),
});

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: unknown | null;
  error_message: string | null;
}> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, data: null, error_message: "Validation error: " + parsed.error.message };
  }

  const input = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return { success: false, data: null, error_message: 'CONFIGURATION_ERROR: DATABASE_URL is required' };
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    switch (input.action) {
      case 'create_provider': {
        if (input.name === undefined || input.email === undefined) {
          return { success: false, data: null, error_message: 'name and email are required' };
        }
        const rows = await sql`
          INSERT INTO providers (name, email, phone, specialty, timezone)
          VALUES (${input.name}, ${input.email}, ${input.phone ?? null}, ${input.specialty ?? 'Medicina General'}, ${input.timezone ?? 'America/Argentina/Buenos_Aires'})
          RETURNING provider_id, name, email, specialty, timezone, is_active
        `;
        const row: Record<string, unknown> | undefined = rows[0] as Record<string, unknown> | undefined;
        if (row === undefined) return { success: false, data: null, error_message: 'Failed to create provider' };
        return { success: true, data: { created: true, provider_id: String(row['provider_id']), name: String(row['name']) }, error_message: null };
      }

      case 'update_provider': {
        if (input.provider_id === undefined) return { success: false, data: null, error_message: 'provider_id is required' };
        await sql`
          UPDATE providers
          SET name = COALESCE(${input.name ?? null}, name),
              phone = COALESCE(${input.phone ?? null}, phone),
              specialty = COALESCE(${input.specialty ?? null}, specialty),
              timezone = COALESCE(${input.timezone ?? null}, timezone),
              is_active = COALESCE(${input.is_active ?? null}, is_active),
              updated_at = NOW()
          WHERE provider_id = ${input.provider_id}::uuid
        `;
        return { success: true, data: { updated: true }, error_message: null };
      }

      case 'list_providers': {
        const rows = await sql`
          SELECT provider_id, name, email, phone, specialty, timezone, is_active
          FROM providers ORDER BY name ASC
        `;
        return { success: true, data: { providers: rows }, error_message: null };
      }

      case 'create_service': {
        if (input.provider_id === undefined || input.service_name === undefined) {
          return { success: false, data: null, error_message: 'provider_id and service_name are required' };
        }
        const rows = await sql`
          INSERT INTO services (provider_id, name, description, duration_minutes, buffer_minutes, price_cents, currency)
          VALUES (${input.provider_id}::uuid, ${input.service_name}, ${input.description ?? null}, ${input.duration_minutes ?? 30}, ${input.buffer_minutes ?? 10}, ${input.price_cents ?? 0}, ${input.currency ?? 'MXN'})
          RETURNING service_id, name, duration_minutes
        `;
        const row: Record<string, unknown> | undefined = rows[0] as Record<string, unknown> | undefined;
        if (row === undefined) return { success: false, data: null, error_message: 'Failed to create service' };
        return { success: true, data: { created: true, service_id: String(row['service_id']), name: String(row['name']) }, error_message: null };
      }

      case 'update_service': {
        if (input.service_id === undefined) return { success: false, data: null, error_message: 'service_id is required' };
        await sql`
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
        return { success: true, data: { updated: true }, error_message: null };
      }

      case 'list_services': {
        const rows = await sql`
          SELECT s.service_id, s.name, s.description, s.duration_minutes, s.buffer_minutes,
                 s.price_cents, s.currency, s.is_active, p.name as provider_name
          FROM services s JOIN providers p ON p.provider_id = s.provider_id
          ORDER BY p.name, s.name ASC
        `;
        return { success: true, data: { services: rows }, error_message: null };
      }

      case 'set_schedule': {
        if (input.provider_id === undefined || input.day_of_week === undefined || input.start_time === undefined || input.end_time === undefined) {
          return { success: false, data: null, error_message: 'provider_id, day_of_week, start_time, end_time are required' };
        }
        await sql`
          INSERT INTO provider_schedules (provider_id, day_of_week, start_time, end_time, is_active)
          VALUES (${input.provider_id}::uuid, ${input.day_of_week}, ${input.start_time}::time, ${input.end_time}::time, true)
          ON CONFLICT (provider_id, day_of_week, start_time)
          DO UPDATE SET end_time = EXCLUDED.end_time, is_active = true
        `;
        return { success: true, data: { updated: true }, error_message: null };
      }

      case 'remove_schedule': {
        if (input.provider_id === undefined || input.day_of_week === undefined) {
          return { success: false, data: null, error_message: 'provider_id and day_of_week are required' };
        }
        await sql`
          UPDATE provider_schedules SET is_active = false
          WHERE provider_id = ${input.provider_id}::uuid AND day_of_week = ${input.day_of_week}
        `;
        return { success: true, data: { deactivated: true }, error_message: null };
      }

      case 'set_override': {
        if (input.provider_id === undefined || input.override_date === undefined) {
          return { success: false, data: null, error_message: 'provider_id and override_date are required' };
        }
        await sql`
          INSERT INTO schedule_overrides (provider_id, override_date, is_blocked, start_time, end_time, reason)
          VALUES (${input.provider_id}::uuid, ${input.override_date}::date, ${input.is_blocked ?? false},
                  ${input.start_time ?? null}::time, ${input.end_time ?? null}::time, ${input.override_reason ?? null})
          ON CONFLICT (provider_id, override_date)
          DO UPDATE SET is_blocked = EXCLUDED.is_blocked,
                        start_time = EXCLUDED.start_time,
                        end_time = EXCLUDED.end_time,
                        reason = EXCLUDED.reason
        `;
        return { success: true, data: { updated: true }, error_message: null };
      }

      case 'remove_override': {
        if (input.provider_id === undefined || input.override_date === undefined) {
          return { success: false, data: null, error_message: 'provider_id and override_date are required' };
        }
        await sql`DELETE FROM schedule_overrides WHERE provider_id = ${input.provider_id}::uuid AND override_date = ${input.override_date}::date`;
        return { success: true, data: { deleted: true }, error_message: null };
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: "Internal error: " + message };
  } finally {
    await sql.end();
  }
}
