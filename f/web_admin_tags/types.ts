import { z } from 'zod';

export const ActionSchema = z.enum([
  'list_categories',
  'create_category',
  'update_category',
  'delete_category',
  'activate_category',
  'deactivate_category',
  'list_tags',
  'create_tag',
  'update_tag',
  'delete_tag',
  'activate_tag',
  'deactivate_tag',
  'list_all',
]);

export const InputSchema = z.object({
  admin_user_id: z.uuid(),
  action: ActionSchema,
  category_id: z.uuid().optional(),
  tag_id: z.uuid().optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
  is_active: z.boolean().optional(),
});

export type TagInput = Readonly<z.infer<typeof InputSchema>>;

export interface CategoryRow {
  readonly category_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly is_active: boolean;
  readonly sort_order: number;
  readonly created_at: Date;
  readonly tag_count: number;
}

export interface TagRow {
  readonly tag_id: string;
  readonly category_id: string;
  readonly category_name: string;
  readonly name: string;
  readonly description: string | null;
  readonly color: string;
  readonly is_active: boolean;
  readonly sort_order: number;
  readonly created_at: Date;
}
