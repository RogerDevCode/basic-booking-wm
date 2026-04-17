import { createDbClient } from '../internal/db/client';
import { withTenantContext } from '../internal/tenant-context';
import { resolveDate, resolveTime } from '../internal/date-resolver';
import type { Result } from '../internal/result';
import type {
  InputType,
  OrchestratorResult,
  OrchestratorBookingIntent,
  AvailabilityData,
  BookingRow,
  ResolvedContext,
} from './types';



export function getEntity(entities: Record<string, string | null>, key: string): string | undefined {
  return entities[key] ?? undefined;
}

export function normalizeIntent(intent: string): OrchestratorBookingIntent | null {
  const legacyMap: Record<string, OrchestratorBookingIntent> = {
    'reagendar': 'reagendar_cita',
    'consultar_disponible': 'ver_disponibilidad',
    'consultar_disponibilidad': 'ver_disponibilidad',
    'ver_mis_citas': 'mis_citas',
  };

  const normalized = legacyMap[intent];
  if (normalized) return normalized;
  if (['crear_cita', 'cancelar_cita', 'reagendar_cita', 'ver_disponibilidad', 'mis_citas'].includes(intent)) {
    return intent as OrchestratorBookingIntent;
  }
  return null;
}

export async function resolveContext(
  input: Readonly<InputType>
): Promise<Result<ResolvedContext>> {
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) return [new Error('DATABASE_URL not set'), null];

  const sql = createDbClient({ url: dbUrl });

  let tenantId = input.tenant_id;
  let clientId = input.client_id;
  let providerId = input.provider_id ?? getEntity(input.entities, 'provider_id');
  let serviceId = input.service_id ?? getEntity(input.entities, 'service_id');
  let resolvedDate = input.date ?? getEntity(input.entities, 'date');
  let resolvedTime = input.time ?? getEntity(input.entities, 'time');

  if (resolvedDate) {
    const abs = resolveDate(resolvedDate);
    if (abs) resolvedDate = abs;
  }
  if (resolvedTime) {
    const abs = resolveTime(resolvedTime);
    if (abs) resolvedTime = abs;
  }

  if (!tenantId) {
    const providerRows = await sql`SELECT provider_id FROM providers LIMIT 1`;
    const first = providerRows[0];
    if (first && typeof first['provider_id'] === 'string') {
      tenantId = first['provider_id'];
      providerId ??= tenantId;
    }
  }

  if (!tenantId) return [new Error('Could not resolve tenant_id'), null];

  if (!clientId && input.telegram_chat_id) {
    const clientRows = await sql`
      SELECT client_id FROM clients WHERE telegram_chat_id = ${input.telegram_chat_id} LIMIT 1
    `;
    const first = clientRows[0];
    if (first && typeof first['client_id'] === 'string') {
      clientId = first['client_id'];
    } else {
      const inserted = await sql`
        INSERT INTO clients (name, telegram_chat_id)
        VALUES (${input.telegram_name ?? 'Usuario Telegram'}, ${input.telegram_chat_id})
        RETURNING client_id
      `;
      const insertedRow = inserted[0];
      if (insertedRow && typeof insertedRow['client_id'] === 'string') {
        clientId = insertedRow['client_id'];
      }
    }
  }

  if (!serviceId && providerId) {
    const serviceRows = await sql`SELECT service_id FROM services WHERE provider_id = ${providerId}::uuid LIMIT 1`;
    const first = serviceRows[0];
    if (first && typeof first['service_id'] === 'string') {
      serviceId = first['service_id'];
    }
  }

  return [null, {
    tenantId,
    clientId,
    providerId,
    serviceId,
    date: resolvedDate,
    time: resolvedTime,
  }];
}

export async function handleCreateBooking(
  input: Readonly<InputType>
): Promise<Result<OrchestratorResult>> {
  const { client_id, provider_id, service_id, date, time } = input;

  if (!client_id || !provider_id || !service_id || !date || !time) {
    return [null, {
      action: 'crear_cita',
      success: false,
      data: null,
      message: 'Faltan datos para confirmar la cita. Vamos al asistente.',
      follow_up: '¿Continuamos?',
      nextState: { name: 'selecting_specialty', error: null, items: [] },
      nextDraft: {
        specialty_id: null, specialty_name: null,
        doctor_id: provider_id ?? null,
        doctor_name: getEntity(input.entities, 'provider_name') ?? null,
        target_date: date ?? null,
        start_time: time && date ? `${date}T${time}:00` : null,
        time_label: time ?? null,
        client_id: client_id ?? null,
      }
    }];
  }

  const startTime = new Date(`${date}T${time}:00`);
  const { main: createBooking } = await import('../booking_create/main');
  const [err, data] = await createBooking({
    client_id, provider_id, service_id,
    start_time: startTime.toISOString(),
    idempotency_key: `orch-${client_id}-${provider_id}-${date}-${time}`,
    notes: input.notes,
    actor: 'client',
    channel: input.channel,
  });

  return [null, {
    action: 'crear_cita',
    success: !err,
    data,
    message: err ? `❌ No se pudo agendar: ${err.message}` : `✅ Cita agendada para el ${date} a las ${time}.`,
    follow_up: err ? '¿Quieres intentar otro horario?' : undefined,
  }];
}

export async function handleCancelBooking(
  input: Readonly<InputType>
): Promise<Result<OrchestratorResult>> {
  const bookingId = input.booking_id ?? getEntity(input.entities, 'booking_id');

  if (!bookingId) {
    return handleGetMyBookings({
      ...input,
      notes: 'Por favor, dime el ID de la cita que deseas cancelar.'
    });
  }

  const { main: cancelBooking } = await import('../booking_cancel/main');
  const [err, data] = await cancelBooking({
    booking_id: bookingId,
    actor: 'client',
    actor_id: input.client_id,
    reason: getEntity(input.entities, 'reason') ?? input.notes,
  });

  return [null, {
    action: 'cancelar_cita',
    success: !err,
    data,
    message: err ? `❌ No se pudo cancelar: ${err.message}` : '✅ Tu cita ha sido cancelada exitosamente.',
  }];
}

export async function handleReschedule(
  input: Readonly<InputType>
): Promise<Result<OrchestratorResult>> {
  const bookingId = input.booking_id ?? getEntity(input.entities, 'booking_id');
  const { date, time } = input;

  if (!bookingId) {
    return handleGetMyBookings({
      ...input,
      notes: 'Dime el ID de la cita que quieres mover y la nueva fecha/hora.'
    });
  }

  if (!date || !time) {
    return [null, {
      action: 'reagendar_cita',
      success: false,
      data: null,
      message: 'Necesito la nueva fecha y hora para reagendar.',
      follow_up: '¿Para cuándo te gustaría moverla?',
      nextState: { name: 'selecting_time', specialtyId: '', doctorId: '', doctorName: '', targetDate: date ?? null, error: null, items: [] },
      nextDraft: {
        specialty_id: null, specialty_name: null,
        doctor_id: input.provider_id ?? null,
        doctor_name: getEntity(input.entities, 'provider_name') ?? null,
        target_date: date ?? null,
        start_time: null, time_label: null,
        client_id: input.client_id ?? null,
      }
    }];
  }

  const { main: rescheduleBooking } = await import('../booking_reschedule/main');
  const [err, data] = await rescheduleBooking({
    booking_id: bookingId,
    new_start_time: new Date(`${date}T${time}:00`).toISOString(),
    actor: 'client',
    actor_id: input.client_id,
    reason: getEntity(input.entities, 'reason') ?? input.notes,
  });

  return [null, {
    action: 'reagendar_cita',
    success: !err,
    data,
    message: err ? `❌ No se pudo reagendar: ${err.message}` : `✅ Reagendada para el ${date} a las ${time}.`,
  }];
}

export async function handleListAvailable(
  input: Readonly<InputType>
): Promise<Result<OrchestratorResult>> {
  const { provider_id, date, service_id } = input;

  if (!provider_id || !date) {
    return [null, {
      action: 'ver_disponibilidad',
      success: false,
      data: null,
      message: 'Necesito el doctor y la fecha para consultar disponibilidad.',
    }];
  }

  const { main: checkAvailability } = await import('../availability_check/main');
  const [err, data] = await checkAvailability({
    provider_id, date, service_id,
  });

  if (err || !data) {
    return [null, {
      action: 'ver_disponibilidad', success: false, data: null,
      message: `❌ Error: ${err?.message ?? 'Desconocido'}`,
    }];
  }

  const avail = data as unknown as AvailabilityData;
  if (avail.is_blocked) {
    return [null, {
      action: 'ver_disponibilidad', success: true, data,
      message: `😅 No hay disponibilidad el ${date}: ${avail.block_reason ?? 'Motivo desconocido'}`,
    }];
  }

  const slots = avail.slots?.filter(s => s.available).slice(0, 10);
  if (!slots || slots.length === 0) {
    return [null, {
      action: 'ver_disponibilidad', success: true, data,
      message: `😅 No hay horarios disponibles el ${date}.`,
    }];
  }

  const slotTimes = slots.map(s => {
    const d = new Date(s.start);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }).join(', ');

  return [null, {
    action: 'ver_disponibilidad', success: true, data,
    message: `📅 Horarios disponibles el ${date}:\n${slotTimes}${avail.total_available > 10 ? '...' : ''}`,
  }];
}

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

  const list = rows.map(r => `• ${fmt.format(new Date(r.start_time))}hs - ${r.provider_name}: ${r.service_name}`).join('\n');

  return [null, {
    action: 'mis_citas',
    success: true,
    data: rows,
    message: list ? `📋 Tus próximas citas:\n${list}` : '📋 No tienes próximas citas.',
    follow_up: input.notes,
  }];
}