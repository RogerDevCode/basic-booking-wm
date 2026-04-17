import { z } from 'zod';

const CANONICAL_INTENTS = [
  'crear_cita',
  'cancelar_cita',
  'reagendar_cita',
  'ver_disponibilidad',
  'mis_citas',
] as const;

export type OrchestratorBookingIntent = typeof CANONICAL_INTENTS[number];

export const InputSchema = z.object({
  tenant_id: z.uuid().optional(),
  intent: z.enum([
    ...CANONICAL_INTENTS,
    'reagendar',
    'consultar_disponible',
    'consultar_disponibilidad',
    'ver_mis_citas',
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

export type InputType = z.infer<typeof InputSchema>;

export interface OrchestratorResult {
  readonly action: string;
  readonly success: boolean;
  readonly data: unknown;
  readonly message: string;
  readonly follow_up?: string | undefined;
  readonly nextState?: import('../internal/booking_fsm/types').BookingState | null | undefined;
  readonly nextDraft?: import('../internal/booking_fsm/types').DraftBooking | null | undefined;
}

export interface AvailabilitySlot {
  readonly start: string;
  readonly available: boolean;
}

export interface AvailabilityData {
  readonly is_blocked: boolean;
  readonly block_reason?: string;
  readonly total_available: number;
  readonly slots: readonly AvailabilitySlot[];
}

export interface BookingRow {
  readonly start_time: string;
  readonly provider_name: string;
  readonly specialty: string;
  readonly service_name: string;
}

export interface ResolvedContext {
  readonly tenantId: string;
  readonly clientId: string | undefined;
  readonly providerId: string | undefined;
  readonly serviceId: string | undefined;
  readonly date: string | undefined;
  readonly time: string | undefined;
}