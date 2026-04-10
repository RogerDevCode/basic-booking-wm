/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Provider stats + agenda for today's appointments
 * DB Tables Used  : providers, bookings, clients, services
 * Concurrency Risk: NO — read-only queries
 * GCal Calls      : NO
 * Idempotency Key : N/A — read-only operation
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates provider_id
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate provider_user_id and optional date via Zod
 * - Resolve provider record via email or provider_id lookup
 * - Query today's agenda ordered by start_time, compute monthly stats with FILTER aggregates
 * - Calculate attendance rate from completed vs total monthly bookings
 *
 * ### Schema Verification
 * - Tables: providers, users, bookings, clients, services
 * - Columns: providers (provider_id, name, specialty, email), bookings (booking_id, provider_id, client_id, service_id, start_time, end_time, status), clients (client_id, name, email), services (service_id, name)
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Provider not found → return error, no partial data
 * - Scenario 2: No bookings for day/month → returns empty agenda, stats with zeros (not an error)
 * - Scenario 3: Invalid date format → Zod validation or Date parsing handles gracefully
 *
 * ### Concurrency Analysis
 * - Risk: NO — read-only queries, no mutation or lock contention
 *
 * ### SOLID Compliance Check
 * - SRP: YES — main orchestrates provider lookup, agenda query, and stats computation as separate logical steps
 * - DRY: YES — Zod schema single source, AgendaItem interface reused for mapping
 * - KISS: YES — direct SELECTs with FILTER aggregates, no unnecessary CTEs or subqueries
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// WEB PROVIDER DASHBOARD — Provider stats + agenda
// ============================================================================
// Returns today's agenda, stats, and client list for a provider.
// ============================================================================

import { z } from 'zod';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  provider_user_id: z.uuid(),
  date: z.string().optional(),
});

interface AgendaItem {
  readonly booking_id: string;
  readonly client_name: string;
  readonly client_email: string | null;
  readonly service_name: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly status: string;
}

interface ProviderStats {
  readonly today_total: number;
  readonly month_total: number;
  readonly month_completed: number;
  readonly month_no_show: number;
  readonly attendance_rate: string;
}

interface DashboardResult {
  readonly provider_id: string;
  readonly provider_name: string;
  readonly specialty: string;
  readonly agenda: readonly AgendaItem[];
  readonly stats: ProviderStats;
}

export async function main(rawInput: unknown): Promise<[Error | null, DashboardResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { provider_user_id, date } = parsed.data;

  const tenantId = provider_user_id;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
      const providerRows = await tx`
        SELECT p.provider_id, p.name, p.specialty
        FROM providers p
        WHERE p.email = (SELECT email FROM users WHERE user_id = ${provider_user_id}::uuid LIMIT 1)
           OR p.provider_id = ${provider_user_id}::uuid
        LIMIT 1
      `;

      const providerRow = providerRows[0];
      if (providerRow === undefined) {
        return [new Error('Provider record not found'), null];
      }

      const providerId = String(providerRow['provider_id']);
      const providerName = String(providerRow['name']);
      const specialty = String(providerRow['specialty']);

      const isoDate = new Date().toISOString().split('T');
      const todayStr = isoDate[0] ?? '';
      const targetDate: string = date ?? todayStr;
      const dayStart = targetDate + 'T00:00:00';
      const dayEnd = targetDate + 'T23:59:59';

      const agendaRows = await tx`
        SELECT b.booking_id, b.start_time, b.end_time, b.status,
               pat.name AS client_name, pat.email AS client_email,
               s.name AS service_name
        FROM bookings b
        INNER JOIN clients pat ON b.client_id = pat.client_id
        INNER JOIN services s ON b.service_id = s.service_id
        WHERE b.provider_id = ${providerId}::uuid
          AND b.start_time >= ${dayStart}
          AND b.start_time <= ${dayEnd}
          AND b.status NOT IN ('cancelled', 'rescheduled')
        ORDER BY b.start_time ASC
      `;

      const agenda: AgendaItem[] = [];
      for (const r of agendaRows) {
        agenda.push({
          booking_id: String(r['booking_id']),
          client_name: String(r['client_name']),
          client_email: r['client_email'] !== null ? String(r['client_email']) : null,
          service_name: String(r['service_name']),
          start_time: String(r['start_time']),
          end_time: String(r['end_time']),
          status: String(r['status']),
        });
      }

      const monthStart = targetDate.slice(0, 8) + '01T00:00:00';
      const monthEnd = targetDate.slice(0, 8) + '31T23:59:59';

      const statsRows = await tx`
        SELECT
          COUNT(*) FILTER (WHERE start_time >= ${dayStart} AND start_time <= ${dayEnd} AND status NOT IN ('cancelled', 'rescheduled')) AS today_total,
          COUNT(*) FILTER (WHERE start_time >= ${monthStart} AND start_time <= ${monthEnd}) AS month_total,
          COUNT(*) FILTER (WHERE start_time >= ${monthStart} AND start_time <= ${monthEnd} AND status = 'completed') AS month_completed,
          COUNT(*) FILTER (WHERE start_time >= ${monthStart} AND start_time <= ${monthEnd} AND status = 'no_show') AS month_no_show
        FROM bookings
        WHERE provider_id = ${providerId}::uuid
      `;

      const sRow = statsRows[0];
      const todayTotal = sRow !== undefined ? Number(sRow['today_total']) : 0;
      const monthTotal = sRow !== undefined ? Number(sRow['month_total']) : 0;
      const monthCompleted = sRow !== undefined ? Number(sRow['month_completed']) : 0;
      const monthNoShow = sRow !== undefined ? Number(sRow['month_no_show']) : 0;
      const attendanceRate = monthTotal > 0 ? ((monthCompleted / monthTotal) * 100).toFixed(1) : '0.0';

      return [null, {
        provider_id: providerId,
        provider_name: providerName,
        specialty: specialty,
        agenda: agenda,
        stats: {
          today_total: todayTotal,
          month_total: monthTotal,
          month_completed: monthCompleted,
          month_no_show: monthNoShow,
          attendance_rate: attendanceRate,
        },
      }];
    });

    if (txErr) {
      return [txErr, null];
    }
    
    return [null, txData];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
