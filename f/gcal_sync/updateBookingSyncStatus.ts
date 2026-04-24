import type { Result } from '../internal/result/index.ts';
import { withTenantContext } from '../internal/tenant-context/index.ts';
import { type Sql } from "./types.ts";

export async function updateBookingSyncStatus(sql: Sql, tenantId: string, bookingId: string, update: {
    providerEventId: string | null;
    clientEventId: string | null;
    status: 'synced' | 'partial' | 'pending';
    errorCount: number;
    }): Promise<Result<void>> {
    return withTenantContext(sql, tenantId, async (tx) => {
    await tx`
      UPDATE bookings
      SET gcal_provider_event_id = ${update.providerEventId},
          gcal_client_event_id = ${update.clientEventId},
          gcal_sync_status = ${update.status},
          gcal_last_sync = NOW(),
          gcal_retry_count = ${update.errorCount > 0 ? 1 : 0}
      WHERE booking_id = ${bookingId}::uuid
    `;
    return [null, undefined];
    });
}
