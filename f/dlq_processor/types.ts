import { z } from 'zod';
import postgres from 'postgres';

export const InputSchema = z.object({
  action: z.enum(['list', 'retry', 'resolve', 'discard', 'status']),
  dlq_id: z.number().int().optional(),
  status_filter: z.string().optional(),
  resolution_notes: z.string().optional(),
  resolved_by: z.string().optional(),
  max_retries: z.number().int().min(1).max(20).default(10),
});

export type Input = z.infer<typeof InputSchema>;

/**
 * Result shape for final validation.
 * Using passthrough to allow flexible return shapes while ensuring basic structure.
 */
export const DLQResultSchema = z.object({}).passthrough();

/**
 * Validates and transforms a raw database row into a structured DLQEntry.
 * Ensures type safety without manual casting.
 */
export const DLQRowSchema = z.object({
  dlq_id: z.number(),
  booking_id: z.string().nullable(),
  provider_id: z.string().nullable(),
  service_id: z.string().nullable(),
  failure_reason: z.string(),
  last_error_message: z.string(),
  last_error_stack: z.string().nullable(),
  original_payload: z.record(z.string(), z.unknown()).nullable().transform((v) => v ?? {}),
  idempotency_key: z.string(),
  status: z.enum(['pending', 'resolved', 'discarded']),
  created_at: z.date().transform((d) => d.toISOString()),
  updated_at: z.date().transform((d) => d.toISOString()),
  resolved_at: z.date().nullable().transform((d) => d?.toISOString() ?? null),
  resolved_by: z.string().nullable(),
  resolution_notes: z.string().nullable(),
});

export type DLQEntry = z.infer<typeof DLQRowSchema>;

export type TxClient = postgres.Sql;
