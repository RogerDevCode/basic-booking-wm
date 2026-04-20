import { z } from 'zod';
import type { UUID } from '../internal/db-types/index';

export const InputSchema = z.object({
  client_id: z.uuid(),
  provider_id: z.uuid(),
  service_id: z.uuid(),
  start_time: z.coerce.date(),
  idempotency_key: z.string().min(1),
  notes: z.string().optional(),
  actor: z.enum(['client', 'provider', 'system']).default('client'),
  channel: z.enum(['telegram', 'web', 'api']).default('api'),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface BookingCreated {
  readonly booking_id: UUID;
  readonly status: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly provider_name: string;
  readonly service_name: string;
  readonly client_name: string;
}

export interface BookingContext {
  readonly client: { readonly id: string; readonly name: string };
  readonly provider: { readonly id: string; readonly name: string; readonly timezone: string };
  readonly service: { readonly id: string; readonly name: string; readonly duration: number };
}