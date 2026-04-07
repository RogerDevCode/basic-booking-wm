// ============================================================================
// BOOKING ORCHESTRATOR — Routes AI intents to booking actions
// ============================================================================
// Receives classified intent from AI Agent and executes the appropriate action.
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { createDbClient } from '../internal/db/client';
import { withTenantContext } from '../internal/tenant-context';

const InputSchema = z.object({
  tenant_id: z.uuid(),
  intent: z.enum(['create_booking', 'cancel_booking', 'reschedule', 'list_available', 'get_my_bookings']),
  entities: z.record(z.string(), z.string()).default({}),
  client_id: z.uuid().optional(),
  provider_id: z.uuid().optional(),
  service_id: z.uuid().optional(),
  booking_id: z.uuid().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  notes: z.string().optional(),
  channel: z.enum(['telegram', 'web', 'api']).default('api'),
});

export interface OrchestratorResult {
  readonly action: string;
  readonly success: boolean;
  readonly data: unknown;
  readonly message: string;
  readonly follow_up?: string;
}

function getEntity(entities: Record<string, string>, key: string): string | undefined {
  return entities[key];
}

// ─── Action Handlers ────────────────────────────────────────────────────────
async function handleCreateBooking(
  input: Readonly<z.infer<typeof InputSchema>>
): Promise<[Error | null, OrchestratorResult | null]> {
  const clientId = input.client_id ?? getEntity(input.entities, 'client_id');
  const providerId = input.provider_id ?? getEntity(input.entities, 'provider_id');
  const serviceId = input.service_id ?? getEntity(input.entities, 'service_id');
  const date = input.date ?? getEntity(input.entities, 'date');
  const time = input.time ?? getEntity(input.entities, 'time');

  if (clientId === undefined || providerId === undefined || serviceId === undefined || date === undefined || time === undefined) {
    const result: OrchestratorResult = {
      action: 'create_booking',
      success: false,
      data: null,
      message: 'Faltan datos para agendar la cita.',
      follow_up: 'Necesito: paciente, doctor, servicio, fecha y hora.',
    };
    return [null, result];
  }

  const startTime = new Date(`${date}T${time}:00`);
  const idempotencyKey = `orch-${clientId}-${providerId}-${date}-${time}-${String(Date.now())}`;

  const createInput = {
    client_id: clientId,
    provider_id: providerId,
    service_id: serviceId,
    start_time: startTime.toISOString(),
    idempotency_key: idempotencyKey,
    notes: input.notes,
    actor: 'client' as const,
    channel: input.channel,
  };

  const { main: createBooking } = await import('../booking_create/main');
  const [err, data] = await createBooking(createInput);

  if (err === null && data !== null) {
    const result: OrchestratorResult = {
      action: 'create_booking',
      success: true,
      data,
      message: `✅ Cita agendada para el ${date} a las ${time}.`,
    };
    return [null, result];
  }

  const result: OrchestratorResult = {
    action: 'create_booking',
    success: false,
    data: null,
    message: `❌ No se pudo agendar: ${err?.message ?? 'Error desconocido'}`,
    follow_up: '¿Quieres intentar con otro horario?',
  };
  return [null, result];
}

async function handleCancelBooking(
  input: Readonly<z.infer<typeof InputSchema>>
): Promise<[Error | null, OrchestratorResult | null]> {
  const bookingId = input.booking_id ?? getEntity(input.entities, 'booking_id');
  const clientId = input.client_id ?? getEntity(input.entities, 'client_id');

  if (bookingId === undefined) {
    const result: OrchestratorResult = {
      action: 'cancel_booking',
      success: false,
      data: null,
      message: 'Necesito el ID de la cita que quieres cancelar.',
      follow_up: '¿Cuál es el ID de tu cita?',
    };
    return [null, result];
  }

  const cancelInput = {
    booking_id: bookingId,
    actor: 'client' as const,
    actor_id: clientId,
    reason: getEntity(input.entities, 'reason') ?? input.notes,
  };

  const { main: cancelBooking } = await import('../booking_cancel/main');
  const [err, data] = await cancelBooking(cancelInput);

  if (err === null && data !== null) {
    const result: OrchestratorResult = {
      action: 'cancel_booking',
      success: true,
      data,
      message: '✅ Tu cita ha sido cancelada exitosamente.',
    };
    return [null, result];
  }

  const result: OrchestratorResult = {
    action: 'cancel_booking',
    success: false,
    data: null,
    message: `❌ No se pudo cancelar: ${err?.message ?? 'Error desconocido'}`,
  };
  return [null, result];
}

async function handleReschedule(
  input: Readonly<z.infer<typeof InputSchema>>
): Promise<[Error | null, OrchestratorResult | null]> {
  const bookingId = input.booking_id ?? getEntity(input.entities, 'booking_id');
  const clientId = input.client_id ?? getEntity(input.entities, 'client_id');
  const date = input.date ?? getEntity(input.entities, 'date');
  const time = input.time ?? getEntity(input.entities, 'time');

  if (bookingId === undefined || date === undefined || time === undefined) {
    const result: OrchestratorResult = {
      action: 'reschedule',
      success: false,
      data: null,
      message: 'Necesito el ID de la cita y la nueva fecha/hora.',
      follow_up: '¿Cuál es el ID de tu cita y cuándo la quieres?',
    };
    return [null, result];
  }

  const newStartTime = new Date(`${date}T${time}:00`);

  const rescheduleInput = {
    booking_id: bookingId,
    new_start_time: newStartTime.toISOString(),
    actor: 'client' as const,
    actor_id: clientId,
    reason: getEntity(input.entities, 'reason') ?? input.notes,
  };

  const { main: rescheduleBooking } = await import('../booking_reschedule/main');
  const [err, data] = await rescheduleBooking(rescheduleInput);

  if (err === null && data !== null) {
    const result: OrchestratorResult = {
      action: 'reschedule',
      success: true,
      data,
      message: `✅ Tu cita ha sido reagendada para el ${date} a las ${time}.`,
    };
    return [null, result];
  }

  const result: OrchestratorResult = {
    action: 'reschedule',
    success: false,
    data: null,
    message: `❌ No se pudo reagendar: ${err?.message ?? 'Error desconocido'}`,
    follow_up: '¿Quieres intentar con otro horario?',
  };
  return [null, result];
}

async function handleListAvailable(
  input: Readonly<z.infer<typeof InputSchema>>
): Promise<[Error | null, OrchestratorResult | null]> {
  const providerId = input.provider_id ?? getEntity(input.entities, 'provider_id');
  const date = input.date ?? getEntity(input.entities, 'date');
  const serviceId = input.service_id ?? getEntity(input.entities, 'service_id');

  if (providerId === undefined || date === undefined) {
    const result: OrchestratorResult = {
      action: 'list_available',
      success: false,
      data: null,
      message: 'Necesito el doctor y la fecha para consultar disponibilidad.',
      follow_up: '¿Para qué doctor y fecha quieres ver horarios?',
    };
    return [null, result];
  }

  const checkInput = {
    provider_id: providerId,
    date,
    service_id: serviceId,
  };

  const { main: checkAvailability } = await import('../availability_check/main');
  const [err, data] = await checkAvailability(checkInput);

  if (err === null && data !== null) {
    interface AvailabilityData {
      readonly is_blocked?: boolean;
      readonly block_reason?: string;
      readonly total_available?: number;
      readonly slots?: readonly { readonly start: string; readonly available: boolean }[];
    }

    function isAvailabilityData(d: unknown): d is AvailabilityData {
      if (typeof d !== 'object' || d === null) return false;
      const obj = d;
      const isBlocked = (obj as Record<string, unknown>)['is_blocked'];
      const totalAvailable = (obj as Record<string, unknown>)['total_available'];
      const slots = (obj as Record<string, unknown>)['slots'];
      return (
        isBlocked === undefined || typeof isBlocked === 'boolean'
      ) && (
        totalAvailable === undefined || typeof totalAvailable === 'number'
      ) && (
        slots === undefined || Array.isArray(slots)
      );
    }

    if (!isAvailabilityData(data)) {
      const result: OrchestratorResult = {
        action: 'list_available',
        success: false,
        data: null,
        message: '❌ Formato de disponibilidad inesperado.',
      };
      return [null, result];
    }

    const availData: AvailabilityData = data;

    if (availData.is_blocked === true) {
      const result: OrchestratorResult = {
        action: 'list_available',
        success: true,
        data,
        message: `😅 No hay disponibilidad el ${date}: ${availData.block_reason ?? 'Motivo desconocido'}`,
      };
      return [null, result];
    }

    if (availData.total_available === 0) {
      const result: OrchestratorResult = {
        action: 'list_available',
        success: true,
        data,
        message: `😅 No hay horarios disponibles el ${date}. ¿Quieres ver otra fecha?`,
      };
      return [null, result];
    }

    if (availData.slots !== undefined) {
      const slotTimes = availData.slots
        .filter((s) => s.available)
        .slice(0, 10)
        .map((s) => {
          const d = new Date(s.start);
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        })
        .join(', ');

      const remainingCount = (availData.total_available ?? 0) - 10;
      const result: OrchestratorResult = {
        action: 'list_available',
        success: true,
        data,
        message: `📅 Horarios disponibles el ${date}:\n${slotTimes}${remainingCount > 0 ? ` y ${String(remainingCount)} más` : ''}`,
      };
      return [null, result];
    }
  }

  const result: OrchestratorResult = {
    action: 'list_available',
    success: false,
    data: null,
    message: `❌ Error al consultar disponibilidad: ${err?.message ?? 'Error desconocido'}`,
  };
  return [null, result];
}

async function handleGetMyBookings(
  input: Readonly<z.infer<typeof InputSchema>>
): Promise<[Error | null, OrchestratorResult | null]> {
  const clientId = input.client_id ?? getEntity(input.entities, 'client_id');

  if (clientId === undefined) {
    const result: OrchestratorResult = {
      action: 'get_my_bookings',
      success: false,
      data: null,
      message: 'Necesito tu ID de paciente para consultar tus citas.',
    };
    return [null, result];
  }

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  const [dbErr, bookings] = await withTenantContext<readonly unknown[]>(sql, input.tenant_id, async (tx) => {
    return await tx`
      SELECT b.booking_id, b.status, b.start_time, b.end_time,
             p.name as provider_name, s.name as service_name
      FROM bookings b
      JOIN providers p ON p.provider_id = b.provider_id
      JOIN services s ON s.service_id = b.service_id
      WHERE b.client_id = ${clientId}::uuid
        AND b.status NOT IN ('cancelled', 'no_show', 'rescheduled')
      ORDER BY b.start_time ASC
      LIMIT 20
    `;
  });
  if (dbErr !== null) return [dbErr, null];
  if (bookings === null) return [new Error('Unexpected null bookings'), null];

  if (bookings.length === 0) {
    const result: OrchestratorResult = {
      action: 'get_my_bookings',
      success: true,
      data: [],
      message: '📋 No tienes citas programadas.',
      follow_up: '¿Quieres agendar una cita?',
    };
    return [null, result];
  }

  interface BookingRow {
    readonly start_time: string;
    readonly provider_name: string;
    readonly service_name: string;
    readonly status: string;
  }

  const bookingList = bookings
    .map((b: unknown) => {
      const bb = b as BookingRow;
      const d = new Date(bb.start_time);
      const dateStr = d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
      const timeStr = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      return `• ${dateStr} ${timeStr} - ${bb.provider_name} (${bb.service_name}) [${bb.status}]`;
    })
    .join('\n');

  const result: OrchestratorResult = {
    action: 'get_my_bookings',
    success: true,
    data: bookings,
    message: `📋 Tus próximas citas:\n${bookingList}`,
  };
  return [null, result];
}

// ─── Main Entry Point ───────────────────────────────────────────────────────
export async function main(
  rawInput: unknown,
): Promise<[Error | null, OrchestratorResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;

  switch (input.intent) {
    case 'create_booking':
      return handleCreateBooking(input);
    case 'cancel_booking':
      return handleCancelBooking(input);
    case 'reschedule':
      return handleReschedule(input);
    case 'list_available':
      return handleListAvailable(input);
    case 'get_my_bookings':
      return handleGetMyBookings(input);
    default: {
      const _exhaustiveCheck: never = input.intent;
      return [new Error(`Unknown intent: ${String(_exhaustiveCheck)}`), null];
    }
  }
}
