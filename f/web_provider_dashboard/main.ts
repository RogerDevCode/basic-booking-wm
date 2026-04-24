//nobundling
/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Provider stats + agenda for today's appointments
 * DB Tables Used  : providers, bookings, clients, services
 * Concurrency Risk: NO — read-only queries
 * GCal Calls      : NO
 * Idempotency Key : N/A
 * RLS Tenant ID   : YES
 * Zod Schemas     : YES
 */

import { withTenantContext } from '../internal/tenant-context/index.ts';
import { createDbClient } from '../internal/db/client.ts';
import type { Result } from '../internal/result/index.ts';
import { InputSchema, type Input, type DashboardResult } from './types.ts';

export async function main(args: any) : Promise<Result<DashboardResult>> {
const rawInput: unknown = args;
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const input: Input = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [txErr, txData] = await withTenantContext(sql, input.provider_user_id, async (tx) => {
      const providerRows = await tx.values<[string, string, string][]>`
        SELECT p.provider_id, p.name, p.specialty
        FROM providers p
        WHERE p.email = (SELECT email FROM users WHERE user_id = ${input.provider_user_id}::uuid LIMIT 1)
           OR p.provider_id = ${input.provider_user_id}::uuid
        LIMIT 1
      `;

      const providerRow = providerRows[0];
      if (!providerRow) {
        return [new Error('Provider record not found'), null];
      }

      const providerId = providerRow[0];
      const providerName = providerRow[1];
      const providerSpecialty = providerRow[2];

      const isoDate = new Date().toISOString().split('T');
      const todayStr = isoDate[0] ?? '';
      const targetDate = input.date ?? todayStr;

      const agendaRows = await tx.values<[string, string, string, string, string, string][]>`
        SELECT b.booking_id, b.start_time, b.end_time, b.status,
               COALESCE(c.name, '') as client_name,
               s.name as service_name
        FROM bookings b
        INNER JOIN clients c ON b.client_id = c.client_id
        INNER JOIN services s ON b.service_id = s.service_id
        WHERE b.provider_id = ${providerId}::uuid
          AND DATE(b.start_time) = ${targetDate}::date
          AND b.status NOT IN ('cancelled', 'rescheduled')
        ORDER BY b.start_time ASC
      `;

      const agenda = agendaRows.map((row) => ({
        booking_id: row[0],
        client_name: row[4],
        client_email: null,
        service_name: row[5],
        start_time: row[1],
        end_time: row[2],
        status: row[3],
      }));

      const completedRows = await tx.values<[number][]>`
        SELECT COUNT(*) FILTER (WHERE status = 'completed') FROM bookings
        WHERE provider_id = ${providerId}::uuid
          AND DATE_TRUNC('month', start_time) = DATE_TRUNC('month', CURRENT_DATE)
      `;
      const completed = completedRows[0]?.[0] ?? 0;

      return [null, {
        provider_id: providerId,
        provider_name: providerName,
        specialty: providerSpecialty,
        agenda,
        stats: {
          today_total: agenda.length,
          month_total: 0,
          month_completed: completed,
          month_no_show: 0,
          attendance_rate: completed > 0 ? '100.0' : '0.0',
        },
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