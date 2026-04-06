// ============================================================================
// BOOKING ORCHESTRATOR — Routes AI intents to booking actions
// ============================================================================
// Receives classified intent from AI Agent and executes the appropriate action:
// - create_booking → calls booking_create
// - cancel_booking → calls booking_cancel
// - reschedule → calls booking_reschedule
// - list_available → calls availability_check
// - get_my_bookings → queries DB directly
//
// This is the central hub that connects the AI layer to the booking engine.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  intent: z.enum(['create_booking', 'cancel_booking', 'reschedule', 'list_available', 'get_my_bookings']),
  entities: z.record(z.string(), z.unknown()).default({}),
  client_id: z.uuid().optional(),
  provider_id: z.uuid().optional(),
  service_id: z.uuid().optional(),
  booking_id: z.uuid().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  notes: z.string().optional(),
  channel: z.enum(['telegram', 'web', 'api']).default('api'),
});

interface OrchestratorResult {
  action: string;
  success: boolean;
  data: unknown;
  message: string;
  follow_up?: string;
};

async function handleCreateBooking(
  input: z.infer<typeof InputSchema>
): Promise<OrchestratorResult> {
  const clientId = input.client_id ?? (input.entities['client_id'] as string | undefined);
  const providerId = input.provider_id ?? (input.entities['provider_id'] as string | undefined);
  const serviceId = input.service_id ?? (input.entities['service_id'] as string | undefined);
  const date = input.date ?? (input.entities['date'] as string | undefined);
  const time = input.time ?? (input.entities['time'] as string | undefined);

  if (!clientId || !providerId || !serviceId || !date || !time) {
    return {
      action: 'create_booking',
      success: false,
      data: null,
      message: 'Faltan datos para agendar la cita.',
      follow_up: 'Necesito: paciente, doctor, servicio, fecha y hora.',
    };
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
  const result = await createBooking(createInput);

  if (result.success) {
    return {
      action: 'create_booking',
      success: true,
      data: result.data,
      message: `✅ Cita agendada para el ${date} a las ${time}.`,
    };
  }

  return {
    action: 'create_booking',
    success: false,
    data: null,
    message: `❌ No se pudo agendar: ${result.error_message ?? 'Error desconocido'}`,
    follow_up: '¿Quieres intentar con otro horario?',
  };
}

async function handleCancelBooking(
  input: z.infer<typeof InputSchema>
): Promise<OrchestratorResult> {
  const bookingId = input.booking_id ?? (input.entities['booking_id'] as string | undefined);
  const clientId = input.client_id ?? (input.entities['client_id'] as string | undefined);

  if (!bookingId) {
    return {
      action: 'cancel_booking',
      success: false,
      data: null,
      message: 'Necesito el ID de la cita que quieres cancelar.',
      follow_up: '¿Cuál es el ID de tu cita?',
    };
  }

  const cancelInput = {
    booking_id: bookingId,
    actor: 'client' as const,
    actor_id: clientId,
    reason: (input.entities['reason'] as string | undefined) ?? input.notes,
  };

  const { main: cancelBooking } = await import('../booking_cancel/main');
  const result = await cancelBooking(cancelInput);

  if (result.success) {
    return {
      action: 'cancel_booking',
      success: true,
      data: result.data,
      message: '✅ Tu cita ha sido cancelada exitosamente.',
    };
  }

  return {
    action: 'cancel_booking',
    success: false,
    data: null,
    message: `❌ No se pudo cancelar: ${result.error_message ?? 'Error desconocido'}`,
  };
}

async function handleReschedule(
  input: z.infer<typeof InputSchema>
): Promise<OrchestratorResult> {
  const bookingId = input.booking_id ?? (input.entities['booking_id'] as string | undefined);
  const clientId = input.client_id ?? (input.entities['client_id'] as string | undefined);
  const date = input.date ?? (input.entities['date'] as string | undefined);
  const time = input.time ?? (input.entities['time'] as string | undefined);

  if (!bookingId || !date || !time) {
    return {
      action: 'reschedule',
      success: false,
      data: null,
      message: 'Necesito el ID de la cita y la nueva fecha/hora.',
      follow_up: '¿Cuál es el ID de tu cita y cuándo la quieres?',
    };
  }

  const newStartTime = new Date(`${date}T${time}:00`);

  const rescheduleInput = {
    booking_id: bookingId,
    new_start_time: newStartTime.toISOString(),
    actor: 'client' as const,
    actor_id: clientId,
    reason: (input.entities['reason'] as string | undefined) ?? input.notes,
  };

  const { main: rescheduleBooking } = await import('../booking_reschedule/main');
  const result = await rescheduleBooking(rescheduleInput);

  if (result.success) {
    return {
      action: 'reschedule',
      success: true,
      data: result.data,
      message: `✅ Tu cita ha sido reagendada para el ${date} a las ${time}.`,
    };
  }

  return {
    action: 'reschedule',
    success: false,
    data: null,
    message: `❌ No se pudo reagendar: ${result.error_message ?? 'Error desconocido'}`,
    follow_up: '¿Quieres intentar con otro horario?',
  };
}

async function handleListAvailable(
  input: z.infer<typeof InputSchema>
): Promise<OrchestratorResult> {
  const providerId = input.provider_id ?? (input.entities['provider_id'] as string | undefined);
  const date = input.date ?? (input.entities['date'] as string | undefined);
  const serviceId = input.service_id ?? (input.entities['service_id'] as string | undefined);

  if (!providerId || !date) {
    return {
      action: 'list_available',
      success: false,
      data: null,
      message: 'Necesito el doctor y la fecha para consultar disponibilidad.',
      follow_up: '¿Para qué doctor y fecha quieres ver horarios?',
    };
  }

  const checkInput = {
    provider_id: providerId,
    date,
    service_id: serviceId,
  };

  const { main: checkAvailability } = await import('../availability_check/main');
  const result = await checkAvailability(checkInput);

  if (result.success && result.data) {
    if (result.data.is_blocked) {
      return {
        action: 'list_available',
        success: true,
        data: result.data,
        message: `😅 No hay disponibilidad el ${date}: ${result.data.block_reason ?? 'Motivo desconocido'}`,
      };
    }

    if (result.data.total_available === 0) {
      return {
        action: 'list_available',
        success: true,
        data: result.data,
        message: `😅 No hay horarios disponibles el ${date}. ¿Quieres ver otra fecha?`,
      };
    }

    const slotTimes = result.data.slots
      .filter((s) => s.available)
      .slice(0, 10)
      .map((s) => {
        const d = new Date(s.start);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      })
      .join(', ');

    const remainingCount = result.data.total_available - 10;
    return {
      action: 'list_available',
      success: true,
      data: result.data,
      message: `📅 Horarios disponibles el ${date}:\n${slotTimes}${remainingCount > 0 ? ` y ${String(remainingCount)} más` : ''}`,
    };
  }

  return {
    action: 'list_available',
    success: false,
    data: null,
    message: `❌ Error al consultar disponibilidad: ${result.error_message ?? 'Error desconocido'}`,
  };
}

async function handleGetMyBookings(
  input: z.infer<typeof InputSchema>
): Promise<OrchestratorResult> {
  const clientId = input.client_id ?? (input.entities['client_id'] as string | undefined);

  if (!clientId) {
    return {
      action: 'get_my_bookings',
      success: false,
      data: null,
      message: 'Necesito tu ID de paciente para consultar tus citas.',
    };
  }

  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    return { success: false, action: 'get_my_bookings', data: null, message: 'DATABASE_URL not configured' };
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    const bookings = await sql`
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

    if (bookings.length === 0) {
      return {
        action: 'get_my_bookings',
        success: true,
        data: [],
        message: '📋 No tienes citas programadas.',
        follow_up: '¿Quieres agendar una cita?',
      };
    }

    const bookingList = bookings
      .map((b: Record<string, unknown>) => {
        const d = new Date(b['start_time'] as string);
        const dateStr = d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
        const timeStr = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const providerName = typeof b['provider_name'] === 'string' ? b['provider_name'] : 'Unknown';
        const serviceName = typeof b['service_name'] === 'string' ? b['service_name'] : 'Unknown';
        const status = typeof b['status'] === 'string' ? b['status'] : 'Unknown';
        return `• ${dateStr} ${timeStr} - ${providerName} (${serviceName}) [${status}]`;
      })
      .join('\n');

    return {
      action: 'get_my_bookings',
      success: true,
      data: bookings,
      message: `📋 Tus próximas citas:\n${bookingList}`,
    };
  } finally {
    await sql.end();
  }
}

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: OrchestratorResult | null;
  error_message: string | null;
}> {
  try {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };
    }

    const input = parsed.data;

    switch (input.intent) {
      case 'create_booking':
        return { success: true, data: await handleCreateBooking(input), error_message: null };
      case 'cancel_booking':
        return { success: true, data: await handleCancelBooking(input), error_message: null };
      case 'reschedule':
        return { success: true, data: await handleReschedule(input), error_message: null };
      case 'list_available':
        return { success: true, data: await handleListAvailable(input), error_message: null };
      case 'get_my_bookings':
        return { success: true, data: await handleGetMyBookings(input), error_message: null };
      default: {
        const _exhaustiveCheck: never = input.intent;
        return { success: false, data: null, error_message: `Unknown intent: ${String(_exhaustiveCheck)}` };
      }
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { success: false, data: null, error_message: `Internal error: ${error.message}` };
  }
}
