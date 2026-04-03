// ============================================================================
// WEB PROVIDER DASHBOARD — Provider stats + agenda
// ============================================================================
// Returns today's agenda, stats, and patient list for a provider.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  provider_user_id: z.string().uuid(),
  date: z.string().optional(),
});

interface AgendaItem {
  readonly booking_id: string;
  readonly patient_name: string;
  readonly patient_email: string | null;
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

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    const providerRows = await sql`
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

    const agendaRows = await sql`
      SELECT b.booking_id, b.start_time, b.end_time, b.status,
             pat.name AS patient_name, pat.email AS patient_email,
             s.name AS service_name
      FROM bookings b
      INNER JOIN patients pat ON b.patient_id = pat.patient_id
      INNER JOIN services s ON b.service_id = s.service_id
      WHERE b.provider_id = ${providerId}::uuid
        AND b.start_time >= ${dayStart}
        AND b.start_time <= ${dayEnd}
        AND b.status NOT IN ('cancelled', 'rescheduled')
      ORDER BY b.start_time ASC
    `;

    const agenda: AgendaItem[] = [];
    for (let i = 0; i < agendaRows.length; i++) {
      const r = agendaRows[i];
      if (r === undefined) continue;
      agenda.push({
        booking_id: String(r['booking_id']),
        patient_name: String(r['patient_name']),
        patient_email: r['patient_email'] !== null ? String(r['patient_email']) : null,
        service_name: String(r['service_name']),
        start_time: String(r['start_time']),
        end_time: String(r['end_time']),
        status: String(r['status']),
      });
    }

    const monthStart = targetDate.slice(0, 8) + '01T00:00:00';
    const monthEnd = targetDate.slice(0, 8) + '31T23:59:59';

    const statsRows = await sql`
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
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
