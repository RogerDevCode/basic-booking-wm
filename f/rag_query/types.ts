import { z } from 'zod';

export const InputSchema = z.object({
  query: z.string().min(1).max(500),
  top_k: z.number().int().min(1).max(20).default(5),
  category: z.string().optional(),
  provider_id: z.uuid(),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface KBEntry {
  readonly kb_id: string;
  readonly category: string;
  readonly title: string;
  readonly content: string;
  readonly similarity: number;
}

export interface RAGResult {
  readonly entries: KBEntry[];
  readonly count: number;
  readonly method: 'keyword' | 'vector';
}

export interface KBRow {
  readonly kb_id: string;
  readonly category: string;
  readonly title: string;
  readonly content: string;
}
