// ============================================================================
// BOOKING SEARCH — Search and filter bookings
// ============================================================================
// Search by: date range, provider, client, status, service
// Pagination: offset + limit
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  provider_id: z.uuid().optional(),
  client_id: z.uuid().optional(),
  status: z.enum(['pending', 'confirmed', 'in_service', 'completed', 'cancelled', 'no_show', 'rescheduled']).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  service_id: z.uuid().optional(),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(20),
});

interface BookingSearchRow {
  readonly booking_id: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly status: string;
  readonly idempotency_key: string;
  readonly gcal_sync_status: string;
  readonly notification_sent: boolean;
  readonly created_at: string;
  readonly provider_name: string;
  readonly client_name: string;
  readonly service_name: string;
}

interface BookingSearchResult {
  readonly bookings: BookingSearchRow[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
}

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: BookingSearchResult | null;
  error_message: string | null;
}> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, data: null, error_message: 'Validation error: ' + parsed.error.message };
  }

  const input = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return { success: false, data: null, error_message: 'CONFIGURATION_ERROR: DATABASE_URL is required' };
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    // Build WHERE clauses dynamically based on provided filters
    const conditions: string[] = [];
    const params: postgres.ParameterOrJSON<never>[] = [];
    let paramIdx = 1;

    if (input.provider_id !== undefined) {
      conditions.push('b.provider_id = $' + String(paramIdx) + '::uuid');
      params.push(input.provider_id);
      paramIdx++;
    }
    if (input.client_id !== undefined) {
      conditions.push('b.client_id = $' + String(paramIdx) + '::uuid');
      params.push(input.client_id);
      paramIdx++;
    }
    if (input.status !== undefined) {
      conditions.push('b.status = $' + String(paramIdx));
      params.push(input.status);
      paramIdx++;
    }
    if (input.date_from !== undefined) {
      conditions.push('b.start_time >= $' + String(paramIdx) + '::date');
      params.push(input.date_from);
      paramIdx++;
    }
    if (input.date_to !== undefined) {
      conditions.push('b.start_time < ($' + String(paramIdx) + '::date + INTERVAL \'1 day\')');
      params.push(input.date_to);
      paramIdx++;
    }
    if (input.service_id !== undefined) {
      conditions.push('b.service_id = $' + String(paramIdx) + '::uuid');
      params.push(input.service_id);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Count total
    const countRows = await sql.unsafe(
      'SELECT COUNT(*) as total FROM bookings b ' + whereClause,
      params
    );
    const countRow = countRows[0] as { total: string | number } | undefined;
    const total = countRow !== undefined ? Number(countRow.total) : 0;

    // Fetch bookings
    const bookingRows = await sql.unsafe(
      'SELECT b.booking_id, b.start_time, b.end_time, b.status, b.idempotency_key,' +
      ' b.gcal_sync_status, b.notification_sent, b.created_at,' +
      ' p.name as provider_name, pt.name as client_name, s.name as service_name' +
      ' FROM bookings b' +
      ' JOIN providers p ON p.provider_id = b.provider_id' +
      ' JOIN clients pt ON pt.client_id = b.client_id' +
      ' JOIN services s ON s.service_id = b.service_id' +
      ' ' + whereClause +
      ' ORDER BY b.start_time DESC' +
      ' LIMIT $' + String(paramIdx) + ' OFFSET $' + String(paramIdx + 1),
      params.concat([input.limit, input.offset])
    ) as BookingSearchRow[];

    return {
      success: true,
      data: {
        bookings: bookingRows,
        total: total,
        offset: input.offset,
        limit: input.limit,
      },
      error_message: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: 'Internal error: ' + message };
  } finally {
    await sql.end();
  }
}
