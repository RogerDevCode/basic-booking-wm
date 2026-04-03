// ============================================================================
// BOOKING SEARCH — Search and filter bookings
// ============================================================================
// Search by: date range, provider, patient, status, service
// Pagination: offset + limit
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  provider_id: z.string().uuid().optional(),
  patient_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'confirmed', 'in_service', 'completed', 'cancelled', 'no_show', 'rescheduled']).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  service_id: z.string().uuid().optional(),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(20),
});

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: { bookings: Record<string, unknown>[]; total: number; offset: number; limit: number } | null;
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
    if (input.patient_id !== undefined) {
      conditions.push('b.patient_id = $' + String(paramIdx) + '::uuid');
      params.push(input.patient_id);
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
    const countRow: Record<string, unknown> | undefined = countRows[0] as Record<string, unknown> | undefined;
    const total = countRow !== undefined ? Number(countRow['total']) : 0;

    // Fetch bookings
    const bookingRows = await sql.unsafe(
      'SELECT b.booking_id, b.start_time, b.end_time, b.status, b.idempotency_key,' +
      ' b.gcal_sync_status, b.notification_sent, b.created_at,' +
      ' p.name as provider_name, pt.name as patient_name, s.name as service_name' +
      ' FROM bookings b' +
      ' JOIN providers p ON p.provider_id = b.provider_id' +
      ' JOIN patients pt ON pt.patient_id = b.patient_id' +
      ' JOIN services s ON s.service_id = b.service_id' +
      ' ' + whereClause +
      ' ORDER BY b.start_time DESC' +
      ' LIMIT $' + String(paramIdx) + ' OFFSET $' + String(paramIdx + 1),
      params.concat([input.limit, input.offset])
    );

    return {
      success: true,
      data: {
        bookings: bookingRows as Record<string, unknown>[],
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
