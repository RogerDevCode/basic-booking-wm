import { z } from 'zod';

export const ActionSchema = z.enum(['list_regions', 'list_communes', 'search_communes']);

export const InputSchema = z.object({
  action: ActionSchema,
  region_id: z.number().int().optional(),
  search: z.string().max(100).optional(),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface RegionRow {
  readonly region_id: number;
  readonly name: string;
  readonly code: string;
  readonly is_active: boolean;
  readonly sort_order: number;
}

export interface CommuneRow {
  readonly commune_id: number;
  readonly name: string;
  readonly region_id: number;
  readonly region_name: string;
  readonly is_active: boolean;
}