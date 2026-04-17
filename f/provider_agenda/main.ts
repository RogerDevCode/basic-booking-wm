/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : View provider daily/weekly schedule with bookings
 * DB Tables Used  : providers, provider_schedules, bookings, clients, services, schedule_overrides
 * Concurrency Risk: NO — read-only queries
 * GCal Calls      : NO
 * Idempotency Key : N/A — read-only operation
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates provider_id, date_range
 */

import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';
import { InputSchema, type Input, type AgendaResult } from './types';

export async function main(rawInput: unknown): Promise<Result<AgendaResult>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const input: Input = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [txErr, txData] = await withTenantContext(sql, input.provider_id, async (tx) => {
      const providerRows = await tx.values<[string, string][]>`
        SELECT provider_id, name FROM providers
        WHERE provider_id = ${input.provider_id}::uuid AND is_active = true LIMIT 1
      `;

      const providerRow = providerRows[0];
      if (!providerRow) {
        return [new Error('Provider not found or inactive'), null];
      }

      const days: AgendaResult['days'] = [];
      const startDate = new Date(input.date_from);
      const endDate = new Date(input.date_to);
      
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0] ?? '';
        
        const overrideRows = await tx.values<[boolean, string][]>`
          SELECT is_blocked, reason FROM schedule_overrides
          WHERE provider_id = ${input.provider_id}::uuid AND override_date = ${dateStr}::date
          LIMIT 1
        `;

        const overrideRow = overrideRows[0];
        const isBlocked = overrideRow?.[0] ?? false;
        const blockReason = overrideRow?.[1] ?? null;

        const dayOfWeek = d.getUTCDay();
        const scheduleRows = await tx.values<[string, string][]>`
          SELECT start_time, end_time FROM provider_schedules
          WHERE provider_id = ${input.provider_id}::uuid AND day_of_week = ${dayOfWeek} AND is_active = true
        `;

        const bookings = input.include_client_details
          ? (await tx.values<[string, string, string, string, string, string][]>`
              SELECT b.booking_id, b.start_time, b.end_time, b.status, COALESCE(c.full_name, '') as client_name,
                     s.name as service_name
              FROM bookings b
              JOIN services s ON b.service_id = s.service_id
              LEFT JOIN clients c ON b.client_id = c.client_id
              WHERE b.provider_id = ${input.provider_id}::uuid
                AND DATE(b.start_time AT TIME ZONE 'UTC') = ${dateStr}::date
                AND b.status NOT IN ('cancelled', 'no_show')
              ORDER BY b.start_time
            `).map((row) => ({
              booking_id: row[0],
              start_time: row[1],
              end_time: row[2],
              status: row[3],
              client_name: row[4],
              service_name: row[5],
            }))
          : (await tx.values<[string, string, string, string, string][]>`
              SELECT b.booking_id, b.start_time, b.end_time, b.status, s.name
              FROM bookings b
              JOIN services s ON b.service_id = s.service_id
              WHERE b.provider_id = ${input.provider_id}::uuid
                AND DATE(b.start_time AT TIME ZONE 'UTC') = ${dateStr}::date
                AND b.status NOT IN ('cancelled', 'no_show')
              ORDER BY b.start_time
            `).map((row) => ({
              booking_id: row[0],
              start_time: row[1],
              end_time: row[2],
              status: row[3],
              service_name: row[4],
            }));

        days.push({
          date: dateStr,
          is_blocked: isBlocked,
          ...(blockReason ? { block_reason: blockReason } : {}),
          schedule: scheduleRows.map((s) => ({
            start_time: s[0],
            end_time: s[1],
          })),
          bookings,
        });
      }

      return [null, {
        provider_id: input.provider_id,
        provider_name: providerRow[1],
        date_from: input.date_from,
        date_to: input.date_to,
        days,
      }];
    });

    if (txErr) return [txErr, null];
    return [null, txData];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}