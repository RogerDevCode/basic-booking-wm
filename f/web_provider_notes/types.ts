import { z } from 'zod';
import type { Result } from '../internal/result';

export type Input = Readonly<z.infer<typeof InputSchema>>;
export type HandlerResult = Promise<Result<unknown>>;

export interface Tag {
    readonly tag_id: string;
    readonly name: string;
    readonly color: string;
}

export interface NoteRow {
    readonly note_id: string;
    readonly booking_id: string | null;
    readonly client_id: string | null;
    readonly provider_id: string;
    readonly content_encrypted: string | null;
    readonly content: string;
    readonly encryption_version: number;
    readonly created_at: Date | string;
    readonly updated_at: Date | string;
    readonly tags: readonly Tag[];
}

export const InputSchema = z.object({
      provider_id: z.uuid(),
      action: z.enum(['create', 'read', 'update', 'delete', 'list']),
      note_id: z.uuid().optional(),
      booking_id: z.uuid().optional(),
      client_id: z.uuid().optional(),
      content: z.string().min(1).max(5000).optional(),
      tag_ids: z.array(z.uuid()).optional().default([]),
    });
