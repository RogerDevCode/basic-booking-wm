/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Admin stats and system overview KPIs
 * DB Tables Used  : bookings, providers, clients, users, booking_audit
 * Concurrency Risk: NO — read-only aggregate queries
 * GCal Calls      : NO
 * Idempotency Key : N/A — read-only operation
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates admin_user_id
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate admin_user_id and confirm user has 'admin' role and is_active
 * - Run aggregate queries for total_users, total_bookings, revenue, active_providers, pending_bookings
 * - Calculate no_show_rate from completed + no_show bookings
 *
 * ### Schema Verification
 * - Tables: users (user_id, role, is_active), bookings (status, service_id), providers (is_active), services (price_cents)
 * - Columns: All verified against §6 schema; revenue joins bookings.services_id → services.price_cents
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Admin not found or inactive → early return with error before running stats queries
 * - Scenario 2: Empty stats result → defensive check for undefined row, return error
 * - Scenario 3: Division by zero in no_show_rate → guard with totalProcessed > 0 check
 *
 * ### Concurrency Analysis
 * - Risk: NO — read-only aggregate queries with no writes
 *
 * ### SOLID Compliance Check
 * - SRP: YES — single responsibility: fetch and return dashboard KPIs
 * - DRY: YES — aggregate queries consolidated; no duplicated counting logic
 * - KISS: YES — direct SQL aggregates; no intermediate result processing complexity
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// WEB ADMIN DASHBOARD — Admin stats + overview
// ============================================================================
// Returns KPIs and system overview for admin dashboard.
// ============================================================================

import { z } from 'zod';
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
  const tenantId = admin_user_id;

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
