import { z } from 'zod';

export const ActionSchema = z.enum(['list', 'create', 'update', 'delete']);

export const InputSchema = z.object({
  tenant_id: z.uuid(),
  action: ActionSchema,
  honorific_id: z.uuid().optional(),
  code: z.string().max(10).optional(),
  label: z.string().max(10).optional(),
  gender: z.enum(['M', 'F', 'N']).optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
  is_active: z.boolean().optional(),
});

export interface HonorificRow {
  readonly honorific_id: string;
  readonly code: string;
  readonly label: string;
  readonly gender: string | null;
  readonly sort_order: number;
  readonly is_active: boolean;
  readonly created_at: string;
}

export type Input = Readonly<z.infer<typeof InputSchema>>;