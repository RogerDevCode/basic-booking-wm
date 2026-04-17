import { createDbClient } from '../internal/db/client';
import { withTenantContext } from '../internal/tenant-context';
import type { Result } from '../internal/result';
import type { InputType, OrchestratorResult, BookingRow } from './types';

export async function handleGetMyBookings(
  input: Readonly<InputType>
): Promise<Result<OrchestratorResult>> {
  const { client_id, tenant_id } = input;
  if (!client_id || !tenant_id) {
    return [null, { action: 'mis_citas', success: false, data: null, message: 'Falta identificación de paciente.' }];
  }

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }
  const sql = createDbClient({ url: dbUrl });

  const [dbErr, rows] = await withTenantContext<readonly BookingRow[]>(sql, tenant_id, async (tx) => {
    const data = await tx`
      SELECT b.booking_id, b.status, b.start_time, p.name as provider_name, p.specialty, s.name as service_name
      FROM bookings b
      JOIN providers p ON p.provider_id = b.provider_id
      JOIN services s ON s.service_id = b.service_id
      WHERE b.client_id = ${client_id}::uuid
        AND b.status NOT IN ('cancelled', 'no_show', 'rescheduled')
        AND b.start_time >= NOW()
      ORDER BY b.start_time ASC LIMIT 10
    `;
    return [null, data as unknown as readonly BookingRow[]];
  });

  if (dbErr || !rows) return [dbErr ?? new Error('Failed to fetch bookings'), null];

  const fmt = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Mexico_City'
  });

  const list = rows.map((r) => `• ${fmt.format(new Date(r.start_time))}hs - ${r.provider_name}: ${r.service_name}`).join('\n');

  return [null, {
    action: 'mis_citas',
    success: true,
    data: rows,
    message: list ? `📋 Tus próximas citas:\n${list}` : '📋 No tienes próximas citas.',
    follow_up: input.notes,
  }];
}
