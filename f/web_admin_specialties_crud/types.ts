import { z } from 'zod';

export const ActionSchema = z.enum(['list', 'create', 'update', 'delete', 'activate', 'deactivate']);

export const InputSchema = z.object({
  admin_user_id: z.uuid(), // Required for withTenantContext (§12.4)
  action: ActionSchema,
  specialty_id: z.uuid().optional(),
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface SpecialtyRow {
  readonly specialty_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly is_active: boolean;
  readonly sort_order: number;
  readonly created_at: Date;
}
