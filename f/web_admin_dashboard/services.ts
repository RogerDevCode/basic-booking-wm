import type { TxClient } from '../internal/tenant-context/index';
import type { Result } from '../internal/result/index';
import type { Input, AdminDashboardResult } from './types';

export async function fetchDashboardStats(tx: TxClient, input: Input): Promise<Result<AdminDashboardResult>> {
  const { admin_user_id } = input;
  
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
}