// ============================================================================
// WEB ADMIN DASHBOARD — Admin stats + overview
// ============================================================================
// Returns KPIs and system overview for admin dashboard.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  admin_user_id: z.uuid(),
});

interface AdminDashboardResult {
  readonly total_users: number;
  readonly total_bookings: number;
  readonly total_revenue_cents: number;
  readonly no_show_rate: string;
  readonly active_providers: number;
  readonly pending_bookings: number;
}

export async function main(rawInput: unknown): Promise<[Error | null, AdminDashboardResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { admin_user_id } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });
  const tenantId = admin_user_id || '00000000-0000-0000-0000-000000000000';

  try {
    const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
      const adminRows = await tx`
        SELECT role FROM users WHERE user_id = ${admin_user_id}::uuid AND is_active = true LIMIT 1
      `;

      const adminRow = adminRows[0];
      if (adminRow === undefined) {
        return [new Error('Admin not found or inactive'), null];
      }

      if (String(adminRow['role']) !== 'admin') {
        return [new Error('Forbidden: admin access required'), null];
      }

      const statsRows = await tx`
        SELECT
          (SELECT COUNT(*) FROM users) AS total_users,
          (SELECT COUNT(*) FROM bookings WHERE status NOT IN ('cancelled', 'rescheduled')) AS total_bookings,
          (SELECT COALESCE(SUM(s.price_cents), 0)
           FROM bookings b
           INNER JOIN services s ON b.service_id = s.service_id
           WHERE b.status = 'completed') AS total_revenue_cents,
          (SELECT COUNT(*) FROM providers WHERE is_active = true) AS active_providers,
          (SELECT COUNT(*) FROM bookings WHERE status = 'pending') AS pending_bookings
      `;

      const noshowRows = await tx`
        SELECT
          COUNT(*) FILTER (WHERE status = 'no_show') AS no_show_count,
          COUNT(*) FILTER (WHERE status IN ('completed', 'no_show')) AS total_processed
        FROM bookings
      `;

      const nsRow = noshowRows[0];
      const noShowCount = nsRow !== undefined ? Number(nsRow['no_show_count']) : 0;
      const totalProcessed = nsRow !== undefined ? Number(nsRow['total_processed']) : 0;
      const noShowRate = totalProcessed > 0 ? ((noShowCount / totalProcessed) * 100).toFixed(1) : '0.0';

      const sRow = statsRows[0];
      if (sRow === undefined) {
        return [new Error('Failed to fetch dashboard stats'), null];
      }

      return [null, {
        total_users: Number(sRow['total_users']),
        total_bookings: Number(sRow['total_bookings']),
        total_revenue_cents: Number(sRow['total_revenue_cents']),
        no_show_rate: noShowRate,
        active_providers: Number(sRow['active_providers']),
        pending_bookings: Number(sRow['pending_bookings']),
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
