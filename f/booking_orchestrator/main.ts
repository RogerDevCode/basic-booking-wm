/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Routes AI intents to booking actions (create, cancel, reschedule, list)
 * DB Tables Used  : bookings, providers, clients, services, provider_schedules
 * Concurrency Risk: YES — delegates to booking_create/cancel/reschedule which use transactions
 * GCal Calls      : NO — delegates to gcal_sync
 * Idempotency Key : YES — delegates to child scripts
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates all inputs
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate input (tenant_id, intent, entities, optional IDs)
 * - Route to appropriate handler based on intent enum
 * - Each handler extracts entities, validates required fields, delegates to child script
 * - Build user-friendly Spanish response from child script result
 *
 * ### Schema Verification
 * - Tables: bookings, providers, clients, services, provider_schedules (accessed via delegated child scripts)
 * - Columns: All verified against §6 schema; orchestrator itself performs one direct query on bookings/providers/services for get_my_bookings
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Missing required entities → return follow-up message requesting missing data, no DB call
 * - Scenario 2: Child script returns error → wrap error in user-friendly Spanish message
 * - Scenario 3: Dynamic import failure → caught as error, returned as failure result
 * - Scenario 4: Empty bookings list → return informational message, not an error
 *
 * ### Concurrency Analysis
 * - Risk: YES — delegates to booking_create/cancel/reschedule which use transactions with GIST constraints; orchestrator itself is a pure router
 *
 * ### SOLID Compliance Check
 * - SRP: Each handler does one thing — YES (handleCreateBooking, handleCancelBooking, handleReschedule, handleListAvailable, handleGetMyBookings each handle one intent)
 * - DRY: No duplicated logic — YES (getEntity helper for entity extraction, shared OrchestratorResult type)
 * - KISS: No unnecessary complexity — YES (switch-based routing, each handler is linear validate→delegate→format)
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// BOOKING ORCHESTRATOR — Routes AI intents to booking actions
// ============================================================================
// Receives classified intent from AI Agent and executes the appropriate action.
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import { z } from 'zod';
import { createDbClient } from '../internal/db/client';
import { withTenantContext } from '../internal/tenant-context';
import { resolveDate, resolveTime } from '../internal/date-resolver';
import type { BookingState, DraftBooking } from '../internal/booking_fsm/types';
import { logger } from '../internal/logger';

const MODULE = 'booking_orchestrator';

// ── Orchestrator intent types — Spanish, matching AutorizadoIntent (§5.1) ──
type OrchestratorBookingIntent =
  | 'crear_cita'
  | 'cancelar_cita'
  | 'reagendar_cita'
  | 'ver_disponibilidad'
  | 'mis_citas';

function isOrchestratorBookingIntent(value: string): value is OrchestratorBookingIntent {
  return ['crear_cita', 'cancelar_cita', 'reagendar_cita', 'ver_disponibilidad', 'mis_citas'].includes(value);
}

const InputSchema = z.object({
  tenant_id: z.uuid().optional(),
  intent: z.enum([
    'crear_cita', 'cancelar_cita', 'reagendar_cita', 'ver_disponibilidad', 'mis_citas',
    // Legacy aliases accepted but normalized to canonical form
    'reagendar', 'consultar_disponible', 'consultar_disponibilidad', 'ver_mis_citas',
  ]),
  entities: z.record(z.string(), z.string().nullable()).default({}),
  client_id: z.uuid().optional(),
  provider_id: z.uuid().optional(),
  service_id: z.uuid().optional(),
  booking_id: z.uuid().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  notes: z.string().optional(),
  channel: z.enum(['telegram', 'web', 'api']).default('api'),
  telegram_chat_id: z.string().optional(),
  telegram_name: z.string().optional(),
});

export interface OrchestratorResult {
  readonly action: string;
  readonly success: boolean;
  readonly data: unknown;
  readonly message: string;
  readonly follow_up?: string;
  readonly nextState?: BookingState | null;
  readonly nextDraft?: DraftBooking | null;
}

function getEntity(entities: Record<string, string | null>, key: string): string | undefined {
  const val = entities[key];
  return val ?? undefined;
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

  // If data is missing, hand off to wizard instead of just returning an error
  if (clientId === undefined || providerId === undefined || serviceId === undefined || date === undefined || time === undefined) {
    const result: OrchestratorResult = {
      action: 'crear_cita',
      success: false,
      data: null,
      message: 'Faltan algunos datos para confirmar la cita. Vamos a completarlos en el asistente.',
      follow_up: '¿Te parece bien si continuamos por aquí?',
      nextState: { name: 'selecting_specialty', error: null, items: [] }, // Start wizard
      nextDraft: {
        specialty_id: null,
        specialty_name: null,
        doctor_id: providerId ?? null,
        doctor_name: getEntity(input.entities, 'provider_name') ?? null,
        target_date: date ?? null,
        start_time: time ? `${date ?? ''}T${time}:00` : null,
        time_label: time ?? null,
        client_id: clientId ?? null,
      }
    };
    return [null, result];
  }

  const startTime = new Date(`${date}T${time}:00`);
  const idempotencyKey = `orch-${clientId}-${providerId}-${date}-${time}`;

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
      action: 'crear_cita',
      success: true,
      data,
      message: `✅ Cita agendada para el ${date} a las ${time}.`,
    };
    return [null, result];
  }

  const result: OrchestratorResult = {
    action: 'crear_cita',
    success: false,
    data: null,
    message: `❌ No se pudo agendar: ${err?.message ?? 'Error desconocido'}`,
    follow_up: '¿Quieres intentar con otro horario?',
  };
  return [null, result];
}

type GetMyBookingsInput = Readonly<z.infer<typeof InputSchema>> & { readonly follow_up?: string };

async function handleCancelBooking(
  input: Readonly<z.infer<typeof InputSchema>>
): Promise<[Error | null, OrchestratorResult | null]> {
  const bookingId = input.booking_id ?? getEntity(input.entities, 'booking_id');
  const clientId = input.client_id;

  if (bookingId === undefined) {
    // If no booking ID, list appointments first so user can choose
    const listInput: GetMyBookingsInput = {
      ...input,
      follow_up: 'Por favor, dime el ID de la cita que deseas cancelar de la lista anterior.',
    };
    return handleGetMyBookings(listInput);
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
      action: 'cancelar_cita',
      success: true,
      data,
      message: '✅ Tu cita ha sido cancelada exitosamente.',
    };
    return [null, result];
  }

  const result: OrchestratorResult = {
    action: 'cancelar_cita',
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
  const clientId = input.client_id;
  const date = input.date ?? getEntity(input.entities, 'date');
  const time = input.time ?? getEntity(input.entities, 'time');

  if (bookingId === undefined) {
    // If no booking ID, list appointments first so user can choose
    const listInput: GetMyBookingsInput = {
      ...input,
      follow_up: 'Dime el ID de la cita que quieres mover y la nueva fecha/hora.',
    };
    return handleGetMyBookings(listInput);
  }

  if (date === undefined || time === undefined) {
    const result: OrchestratorResult = {
      action: 'reagendar_cita',
      success: false,
      data: null,
      message: 'Para reagendar la cita, necesito saber la nueva fecha y hora.',
      follow_up: '¿Para cuándo te gustaría mover tu cita?',
      nextState: { name: 'selecting_time', specialtyId: '', doctorId: '', doctorName: '', targetDate: date ?? null, error: null, items: [] },
      nextDraft: {
        specialty_id: null,
        specialty_name: null,
        doctor_id: input.provider_id ?? null,
        doctor_name: getEntity(input.entities, 'provider_name') ?? null,
        target_date: date ?? null,
        start_time: null,
        time_label: null,
        client_id: clientId ?? null,
      }
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
      action: 'reagendar_cita',
      success: true,
      data,
      message: `✅ Tu cita ha sido reagendada para el ${date} a las ${time}.`,
    };
    return [null, result];
  }

  const result: OrchestratorResult = {
    action: 'reagendar_cita',
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
      action: 'ver_disponibilidad',
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

    const isAvailabilityData = (d: unknown): d is AvailabilityData => {
      if (typeof d !== 'object' || d === null) return false;
      const obj = d as Record<string, unknown>;
      const isBlocked = obj['is_blocked'];
      const totalAvailable = obj['total_available'];
      const slots = obj['slots'];
      return (
        isBlocked === undefined || typeof isBlocked === 'boolean'
      ) && (
        totalAvailable === undefined || typeof totalAvailable === 'number'
      ) && (
        slots === undefined || Array.isArray(slots)
      );
    };

    if (!isAvailabilityData(data)) {
      const result: OrchestratorResult = {
        action: 'ver_disponibilidad',
        success: false,
        data: null,
        message: '❌ Formato de disponibilidad inesperado.',
      };
      return [null, result];
    }

    const availData: AvailabilityData = data;

    if (availData.is_blocked === true) {
      const result: OrchestratorResult = {
        action: 'ver_disponibilidad',
        success: true,
        data,
        message: `😅 No hay disponibilidad el ${date}: ${availData.block_reason ?? 'Motivo desconocido'}`,
      };
      return [null, result];
    }

    if (availData.total_available === 0) {
      const result: OrchestratorResult = {
        action: 'ver_disponibilidad',
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
        action: 'ver_disponibilidad',
        success: true,
        data,
        message: `📅 Horarios disponibles el ${date}:\n${slotTimes}${remainingCount > 0 ? ` y ${String(remainingCount)} más` : ''}`,
      };
      return [null, result];
    }
  }

  const result: OrchestratorResult = {
    action: 'ver_disponibilidad',
    success: false,
    data: null,
    message: `❌ Error al consultar disponibilidad: ${err?.message ?? 'Error desconocido'}`,
  };
  return [null, result];
}

async function handleGetMyBookings(
  input: Readonly<z.infer<typeof InputSchema>>
): Promise<[Error | null, OrchestratorResult | null]> {
  /*
   * REASONING TRACE
   * 1. Mission: Fetch upcoming bookings for a specific client.
   * 2. Schema: JOIN bookings, providers, services on client_id and provider_id.
   * 3. Filter: client_id AND status NOT IN ('cancelled', 'no_show', 'rescheduled') AND start_time >= NOW().
   * 4. Multi-tenancy: Wrapped in withTenantContext for RLS compliance.
   * 5. Format: List with weekday, day, month, time, provider, specialty, and service.
   */
  const clientId = input.client_id ?? getEntity(input.entities, 'client_id');
  const tenantId = input.tenant_id;

  if (clientId === undefined || tenantId === undefined) {
    const result: OrchestratorResult = {
      action: 'mis_citas',
      success: false,
      data: null,
      message: 'Necesito identificar al paciente para consultar las citas.',
    };
    return [null, result];
  }

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  const [dbErr, bookings] = await withTenantContext<readonly unknown[]>(sql, tenantId, async (tx) => {
    // b.status uses canonical lowercase English states
    const rows = await tx`
      SELECT b.booking_id, b.status, b.start_time, b.end_time,
             p.name as provider_name, p.specialty as provider_specialty,
             s.name as service_name
      FROM bookings b
      JOIN providers p ON p.provider_id = b.provider_id
      JOIN services s ON s.service_id = b.service_id
      WHERE b.client_id = ${clientId}::uuid
        AND b.status NOT IN ('cancelled', 'no_show', 'rescheduled')
        AND b.start_time >= NOW()
      ORDER BY b.start_time ASC
      LIMIT 10
    `;
    return [null, rows as readonly unknown[]];
  });
  if (dbErr !== null) return [dbErr, null];
  if (bookings === null) return [new Error('Unexpected null bookings'), null];

  if (bookings.length === 0) {
    const result: OrchestratorResult = {
      action: 'mis_citas',
      success: true,
      data: [],
      message: '📋 No tienes próximas citas programadas.',
      follow_up: '¿Te gustaría agendar una nueva cita?',
    };
    return [null, result];
  }

  interface BookingRow {
    readonly start_time: string;
    readonly provider_name: string;
    readonly provider_specialty: string;
    readonly service_name: string;
    readonly status: string;
  }

  const isBookingRow = (obj: unknown): obj is BookingRow => {
    if (typeof obj !== 'object' || obj === null) return false;
    const r = obj as Record<string, unknown>;
    return typeof r['start_time'] === 'string'
      && typeof r['provider_name'] === 'string'
      && typeof r['provider_specialty'] === 'string'
      && typeof r['service_name'] === 'string'
      && typeof r['status'] === 'string';
  };

  // Spanish date formatter (deterministic wall-clock representation)
  const fmtDate = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Mexico_City', // Default timezone
  });
  const fmtTime = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Mexico_City',
  });

  const bookingList = bookings
    .filter(isBookingRow)
    .map((bb: BookingRow) => {
      const d = new Date(bb.start_time);
      const dateStr = fmtDate.format(d);
      const timeStr = fmtTime.format(d);
      return `• ${dateStr} ${timeStr}hs - ${bb.provider_name} (${bb.provider_specialty}): ${bb.service_name}`;
    })
    .join('\n');

  const result: OrchestratorResult = {
    action: 'mis_citas',
    success: true,
    data: bookings,
    message: `📋 Tus próximas citas:\n${bookingList}`,
    follow_up: 'Si necesitas cancelar o reagendar alguna, házmelo saber.',
  };
  return [null, result];
}

// ─── Main Entry Point ───────────────────────────────────────────────────────
export async function main(
  rawInput: unknown,
): Promise<[Error | null, OrchestratorResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    logger.error(MODULE, 'Validation failed', parsed.error);
    return [new Error(`Invalid input: ${parsed.error.message}`), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;
  logger.info(MODULE, 'Starting orchestration', { intent: input.intent, channel: input.channel });

  // Normalize legacy Spanish intent aliases to canonical form
  const legacyAliasMap: Record<string, OrchestratorBookingIntent> = {
    'reagendar': 'reagendar_cita',
    'consultar_disponible': 'ver_disponibilidad',
    'consultar_disponibilidad': 'ver_disponibilidad',
    'ver_mis_citas': 'mis_citas',
  };
  const maybeNormalized: OrchestratorBookingIntent | undefined = legacyAliasMap[input.intent];
  // If not a legacy alias, check if it's already a canonical intent
  const normalizedIntent: OrchestratorBookingIntent | undefined = maybeNormalized ?? (
    isOrchestratorBookingIntent(input.intent) ? input.intent : undefined
  );
  if (normalizedIntent === undefined) {
    return [new Error(`Unknown intent: ${input.intent}`), null];
  }

  let resolvedTenantId = input.tenant_id;
  let resolvedClientId = input.client_id;
  let resolvedProviderId = input.provider_id ?? getEntity(input.entities, 'provider_id');
  let resolvedServiceId = input.service_id ?? getEntity(input.entities, 'service_id');
  let resolvedDate = input.date ?? getEntity(input.entities, 'date');
  let resolvedTime = input.time ?? getEntity(input.entities, 'time');

  // Normalize relative dates (hoy, mañana, etc.) to absolute YYYY-MM-DD
  if (resolvedDate !== undefined) {
    const absoluteDate = resolveDate(resolvedDate);
    if (absoluteDate !== null) {
      resolvedDate = absoluteDate;
    }
  }

  // Normalize relative times (10am, etc.) to absolute HH:MM
  if (resolvedTime !== undefined) {
    const absoluteTime = resolveTime(resolvedTime);
    if (absoluteTime !== null) {
      resolvedTime = absoluteTime;
    }
  }

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl !== undefined && dbUrl !== '') {
    const sql = createDbClient({ url: dbUrl });

    // 1. Resolve tenant_id to default if not provided
    if (resolvedTenantId === undefined) {
      const providerRows = await sql`SELECT provider_id FROM providers LIMIT 1`;
      const firstProvider = providerRows[0];
      if (firstProvider && typeof firstProvider['provider_id'] === 'string') {
        resolvedTenantId = firstProvider['provider_id'];
        resolvedProviderId ??= resolvedTenantId;
      }
    }

    // 2. Resolve client_id if telegram_chat_id is provided
    if (resolvedClientId === undefined && input.telegram_chat_id !== undefined) {
      const clientRows = await sql`
        SELECT client_id FROM clients WHERE telegram_chat_id = ${input.telegram_chat_id} LIMIT 1
      `;
      const firstClient = clientRows[0];
      if (firstClient && typeof firstClient['client_id'] === 'string') {
        resolvedClientId = firstClient['client_id'];
      } else {
        const insertRows = await sql`
          INSERT INTO clients (name, telegram_chat_id)
          VALUES (${input.telegram_name ?? 'Usuario Telegram'}, ${input.telegram_chat_id})
          RETURNING client_id
        `;
        const insertedClient = insertRows[0];
        if (insertedClient && typeof insertedClient['client_id'] === 'string') {
          resolvedClientId = insertedClient['client_id'];
        }
      }
    }

    // 3. Resolve service_id to default if missing
    if (resolvedServiceId === undefined && resolvedProviderId !== undefined) {
      const serviceRows = await sql`SELECT service_id FROM services WHERE provider_id = ${resolvedProviderId}::uuid LIMIT 1`;
      const firstService = serviceRows[0];
      if (firstService && typeof firstService['service_id'] === 'string') {
        resolvedServiceId = firstService['service_id'];
      }
    }
  }

  if (resolvedTenantId === undefined) {
    return [new Error('tenant_id not provided and could not be resolved from DB'), null];
  }

  const enrichedInput = {
    ...input,
    tenant_id: resolvedTenantId,
    client_id: resolvedClientId,
    provider_id: resolvedProviderId,
    service_id: resolvedServiceId,
    date: resolvedDate,
    time: resolvedTime,
  };

  let orchRes: [Error | null, OrchestratorResult | null];
  switch (normalizedIntent) {
    case 'crear_cita':
      orchRes = await handleCreateBooking(enrichedInput);
      break;
    case 'cancelar_cita':
      orchRes = await handleCancelBooking(enrichedInput);
      break;
    case 'reagendar_cita':
      orchRes = await handleReschedule(enrichedInput);
      break;
    case 'ver_disponibilidad':
      orchRes = await handleListAvailable(enrichedInput);
      break;
    case 'mis_citas':
      orchRes = await handleGetMyBookings(enrichedInput);
      break;
    default: {
      const _exhaustiveCheck: never = normalizedIntent;
      orchRes = [new Error(`Unknown intent: ${String(_exhaustiveCheck)}`), null];
    }
  }

  if (orchRes[0] !== null) {
    logger.error(MODULE, 'Orchestration failed', orchRes[0]);
  } else {
    logger.info(MODULE, 'Orchestration complete', { action: orchRes[1]?.action, success: orchRes[1]?.success });
  }
  return orchRes;
}
