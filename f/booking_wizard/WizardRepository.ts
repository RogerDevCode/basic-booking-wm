import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context/index';
import type { Result } from '../internal/result/index';
import { DateUtils } from './DateUtils';

export class WizardRepository {
  constructor(private readonly sql: postgres.Sql, private readonly tenantId: string) {}

  async getServiceDuration(serviceId: string): Promise<Result<number>> {
    return withTenantContext(this.sql, this.tenantId, async (tx) => {
      const rows = await tx<{ duration_minutes: number }[]>`
        SELECT duration_minutes FROM services
        WHERE service_id = ${serviceId}::uuid AND is_active = true LIMIT 1
      `;
      const row = rows[0];
      if (row === undefined) {
        return [new Error(`service_not_found: ${serviceId}`), null];
      }
      return [null, row.duration_minutes];
    });
  }

  async getAvailableSlots(providerId: string, dateStr: string, durationMin: number): Promise<Result<readonly string[]>> {
    return withTenantContext(this.sql, this.tenantId, async (tx) => {
      const booked = await tx<{ start_time: Date }[]>`
        SELECT start_time FROM bookings
        WHERE provider_id = ${providerId}::uuid
          AND DATE(start_time) = ${dateStr}::date
          AND status NOT IN ('cancelada', 'no_presentado', 'reagendada')
      `;

      const bookedTimes = new Set(booked.map((row) => {
        const d = new Date(row.start_time);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      }));

      const allSlots = DateUtils.generateTimeSlots(8, 18, durationMin);
      return [null, allSlots.filter((t) => !bookedTimes.has(t))];
    });
  }

  async getProviderAndServiceNames(providerId: string, serviceId: string): Promise<Result<{ provider: string; service: string }>> {
    return withTenantContext(this.sql, this.tenantId, async (tx) => {
      const pRows = await tx<{ name: string }[]>`SELECT name FROM providers WHERE provider_id = ${providerId}::uuid LIMIT 1`;
      const sRows = await tx<{ name: string }[]>`SELECT name FROM services WHERE service_id = ${serviceId}::uuid LIMIT 1`;

      const pRow = pRows[0];
      const sRow = sRows[0];

      if (pRow === undefined || sRow === undefined) {
        return [new Error('integrity_error: provider_or_service_not_found'), null];
      }
      return [null, { provider: pRow.name, service: sRow.name }];
    });
  }

  async createBooking(
    clientId: string,
    providerId: string,
    serviceId: string,
    dateStr: string,
    timeStr: string,
    timezone: string,
    durationMin: number
  ): Promise<Result<string>> {
    return withTenantContext(this.sql, this.tenantId, async (tx) => {
      const localTimestampStr = `${dateStr}T${timeStr}:00`;
      const idempotencyKey = `wizard-${clientId}-${providerId}-${serviceId}-${dateStr}-${timeStr}`;

      const bookingRows = await tx<{ booking_id: string }[]>`
        INSERT INTO bookings (
          client_id, provider_id, service_id, start_time, end_time,
          status, idempotency_key, gcal_sync_status
        ) VALUES (
          ${clientId}::uuid, ${providerId}::uuid, ${serviceId}::uuid,
          (${localTimestampStr}::timestamp AT TIME ZONE ${timezone}),
          (${localTimestampStr}::timestamp AT TIME ZONE ${timezone} + (${durationMin} * INTERVAL '1 minute')),
          'confirmada', ${idempotencyKey}, 'pending'
        )
        ON CONFLICT (idempotency_key)
        DO UPDATE SET updated_at = NOW()
        RETURNING booking_id
      `;

      const bookingRow = bookingRows[0];
      if (bookingRow === undefined) {
        return [new Error('insert_failed: no_booking_id_returned'), null];
      }

      await tx`
        INSERT INTO booking_audit (
          booking_id, from_status, to_status, changed_by, actor_id, reason, metadata
        ) VALUES (
          ${bookingRow.booking_id}::uuid, null, 'confirmada', 'client',
          ${clientId}::uuid, 'Booking created via wizard', '{"channel": "telegram"}'::jsonb
        )
      `;

      return [null, bookingRow.booking_id];
    });
  }
}
