import { DEFAULT_TIMEZONE } from '../internal/config';
import type { Result } from '../internal/result';
import type { TxClient } from '../internal/tenant-context';
import type { Input } from './types';

/** Handles provider-related CRUD operations */
export async function handleProviderActions(tx: TxClient, input: Input): Promise<Result<Record<string, unknown>>> {
  // Narrowing the action type for exhaustiveness check
  const action = input.action as 'create_provider' | 'update_provider' | 'list_providers';
  switch (action) {
    case 'create_provider': {
      if (input.name === undefined || input.email === undefined) {
        return [new Error('MISSING_FIELDS: name and email are required'), null];
      }
      const rows = await tx<{ provider_id: string; name: string }[]>`
        INSERT INTO providers (name, email, phone, specialty, timezone)
        VALUES (${input.name}, ${input.email}, ${input.phone ?? null}, ${input.specialty ?? 'Medicina General'}, ${input.timezone ?? DEFAULT_TIMEZONE})
        RETURNING provider_id, name
      `;
      const row = rows[0];
      if (row === undefined) return [new Error('DATABASE_ERROR: Failed to create provider'), null];
      return [null, { created: true, provider_id: row.provider_id, name: row.name }];
    }

    case 'update_provider': {
      if (input.provider_id === undefined) return [new Error('MISSING_FIELDS: provider_id is required'), null];
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
      const providers = await tx<{ provider_id: string; name: string; email: string; phone: string | null; specialty: string; timezone: string; is_active: boolean }[]>`
        SELECT provider_id, name, email, phone, specialty, timezone, is_active
        FROM providers ORDER BY name ASC
      `;
      return [null, { providers }];
    }
    default:
      return [new Error(`ROUTING_ERROR: Action ${input.action} not handled by Provider handler`), null];
  }
}

/** Handles service-related CRUD operations */
export async function handleServiceActions(tx: TxClient, input: Input): Promise<Result<Record<string, unknown>>> {
  // Narrowing the action type for exhaustiveness check
  const action = input.action as 'create_service' | 'update_service' | 'list_services';
  switch (action) {
    case 'create_service': {
      if (input.provider_id === undefined || input.service_name === undefined) {
        return [new Error('MISSING_FIELDS: provider_id and service_name are required'), null];
      }
      const rows = await tx<{ service_id: string; name: string }[]>`
        INSERT INTO services (provider_id, name, description, duration_minutes, buffer_minutes, price_cents, currency)
        VALUES (${input.provider_id}::uuid, ${input.service_name}, ${input.description ?? null}, ${input.duration_minutes ?? 30}, ${input.buffer_minutes ?? 10}, ${input.price_cents ?? 0}, ${input.currency ?? 'MXN'})
        RETURNING service_id, name
      `;
      const row = rows[0];
      if (row === undefined) return [new Error('DATABASE_ERROR: Failed to create service'), null];
      return [null, { created: true, service_id: row.service_id, name: row.name }];
    }

    case 'update_service': {
      if (input.service_id === undefined) return [new Error('MISSING_FIELDS: service_id is required'), null];
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
      const services = await tx<{ service_id: string; name: string; description: string | null; duration_minutes: number; buffer_minutes: number; price_cents: number; currency: string; is_active: boolean; provider_name: string }[]>`
        SELECT s.service_id, s.name, s.description, s.duration_minutes, s.buffer_minutes,
               s.price_cents, s.currency, s.is_active, p.name as provider_name
        FROM services s JOIN providers p ON p.provider_id = s.provider_id
        ORDER BY p.name, s.name ASC
      `;
      return [null, { services }];
    }
    default:
      return [new Error(`ROUTING_ERROR: Action ${input.action} not handled by Service handler`), null];
  }
}

/** Handles schedule-related CRUD operations */
export async function handleScheduleActions(tx: TxClient, input: Input): Promise<Result<Record<string, unknown>>> {
  // Narrowing the action type for exhaustiveness check
  const action = input.action as 'set_schedule' | 'remove_schedule';
  switch (action) {
    case 'set_schedule': {
      if (input.provider_id === undefined || input.day_of_week === undefined || input.start_time === undefined || input.end_time === undefined) {
        return [new Error('MISSING_FIELDS: provider_id, day_of_week, start_time, end_time are required'), null];
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
        return [new Error('MISSING_FIELDS: provider_id and day_of_week are required'), null];
      }
      await tx`
        UPDATE provider_schedules SET is_active = false
        WHERE provider_id = ${input.provider_id}::uuid AND day_of_week = ${input.day_of_week}
      `;
      return [null, { deactivated: true }];
    }
    default:
      return [new Error(`ROUTING_ERROR: Action ${input.action} not handled by Schedule handler`), null];
  }
}

/** Handles override-related CRUD operations */
export async function handleOverrideActions(tx: TxClient, input: Input): Promise<Result<Record<string, unknown>>> {
  // Narrowing the action type for exhaustiveness check
  const action = input.action as 'set_override' | 'remove_override';
  switch (action) {
    case 'set_override': {
      if (input.provider_id === undefined || input.override_date === undefined) {
        return [new Error('MISSING_FIELDS: provider_id and override_date are required'), null];
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
        return [new Error('MISSING_FIELDS: provider_id and override_date are required'), null];
      }
      await tx`DELETE FROM schedule_overrides WHERE provider_id = ${input.provider_id}::uuid AND override_date = ${input.override_date}::date`;
      return [null, { deleted: true }];
    }
    default:
      return [new Error(`ROUTING_ERROR: Action ${input.action} not handled by Override handler`), null];
  }
}
