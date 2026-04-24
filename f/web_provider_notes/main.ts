//nobundling
/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Clinical notes CRUD with AES-256-GCM encryption at rest
 * DB Tables Used  : service_notes, note_tags, tags
 * Concurrency Risk: NO — single-row CRUD operations per note
 * GCal Calls      : NO
 * Idempotency Key : N/A — note CRUD is inherently non-idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates action and note fields
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Refactor Clinical notes CRUD to follow SOLID principles (SRP, OCP, DRY).
 * - Maintain AES-256-GCM encryption/decryption at rest.
 * - Centralize DB operations into a NoteRepository (SRP).
 * - Use a Strategy pattern (ACTION_HANDLERS) for extensibility (OCP).
 * - Consolidate row-to-model mapping (DRY).
 *
 * ### Schema Verification
 * - Tables: service_notes, note_tags, tags.
 * - Verified columns: note_id, provider_id, booking_id, client_id, content_encrypted, encryption_version, created_at, updated_at.
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Decryption failure → returns placeholder "[ERROR: Unable to decrypt note]" instead of crashing.
 * - Scenario 2: Note not found or wrong provider → Handled by Repository returning [Error, null].
 * - Scenario 3: Missing required params for action → Handled by Zod and specific handler checks.
 *
 * ### Concurrency Analysis
 * - Risk: NO — single-row CRUD operations per note.
 *
 * ### SOLID Compliance Check
 * - SRP: NoteRepository handles persistence; Crypto logic handles security; Main handles orchestration.
 * - OCP: ACTION_HANDLERS map allows adding actions without modifying main flow logic.
 * - DRY: Centralized mapRowToNote helper.
 * - KISS: Clean dispatcher, minimal boilerplate, explicit error propagation.
 *
 * → CLEARED FOR CODE GENERATION
 */

import postgres from 'postgres';
import { createDbClient } from '../internal/db/client.ts';
import type { Result } from '../internal/result/index.ts';
import { withTenantContext } from '../internal/tenant-context/index.ts';
import { encryptContent } from "./encryptContent.ts";
import { mapRowToNote } from "./mapRowToNote.ts";
import { type HandlerResult, type Input, InputSchema, type NoteRow, type Tag } from "./types.ts";

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================
// ============================================================================
// CRYPTO HELPERS
// ============================================================================
// ============================================================================
// DATA MAPPING (DRY)
// ============================================================================
// ============================================================================
// NOTE REPOSITORY (SRP)
// ============================================================================

const NoteRepository = {
  async getTags(tx: postgres.Sql, noteId: string): Promise<Result<Tag[]>> {
    const rows = await tx<Tag[]>`
      SELECT t.tag_id, t.name, t.color
      FROM note_tags nt
      JOIN tags t ON t.tag_id = nt.tag_id
      WHERE nt.note_id = ${noteId}::uuid
      ORDER BY t.name ASC
    `;
    return [null, rows];
  },

  async assignTags(tx: postgres.Sql, noteId: string, tagIds: readonly string[]): Promise<Result<void>> {
    if (tagIds.length === 0) return [null, undefined];
    
    // Optimized batch insert
    const values = tagIds.map(tagId => ({ note_id: noteId, tag_id: tagId }));
    await tx`
      INSERT INTO note_tags ${tx(values, 'note_id', 'tag_id')}
      ON CONFLICT (note_id, tag_id) DO NOTHING
    `;
    return [null, undefined];
  },

  async create(
    tx: postgres.Sql,
    data: { provider_id: string; booking_id: string; client_id: string; content: string; tag_ids: readonly string[] }
  ): Promise<Result<NoteRow>> {
    const { encrypted, version } = encryptContent(data.content);

    const [row] = await tx`
      INSERT INTO service_notes (provider_id, booking_id, client_id, content_encrypted, encryption_version)
      VALUES (${data.provider_id}::uuid, ${data.booking_id}::uuid, ${data.client_id}::uuid, ${encrypted}, ${version})
      RETURNING *
    `;

    if (!row) return [new Error('create_failed: no row returned'), null];

    await this.assignTags(tx, String(row['note_id']), data.tag_ids);
    const [_err, tags] = await this.getTags(tx, String(row['note_id']));

    return [null, mapRowToNote(row, tags ?? [])];
  },

  async read(tx: postgres.Sql, providerId: string, noteId: string): Promise<Result<NoteRow>> {
    const [row] = await tx`
      SELECT * FROM service_notes
      WHERE note_id = ${noteId}::uuid AND provider_id = ${providerId}::uuid
      LIMIT 1
    `;

    if (!row) return [new Error('Note not found or access denied'), null];

    const [_err, tags] = await this.getTags(tx, String(row['note_id']));
    return [null, mapRowToNote(row, tags ?? [])];
  },

  async update(
    tx: postgres.Sql,
    providerId: string,
    noteId: string,
    data: { content: string; tag_ids: readonly string[] }
  ): Promise<Result<NoteRow>> {
    const { encrypted, version } = encryptContent(data.content);

    const [row] = await tx`
      UPDATE service_notes
      SET content_encrypted = ${encrypted}, encryption_version = ${version}, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid AND provider_id = ${providerId}::uuid
      RETURNING *
    `;

    if (!row) return [new Error('Note not found or access denied'), null];

    await tx`DELETE FROM note_tags WHERE note_id = ${noteId}::uuid`;
    await this.assignTags(tx, noteId, data.tag_ids);
    
    const [_err, tags] = await this.getTags(tx, String(row['note_id']));
    return [null, mapRowToNote(row, tags ?? [])];
  },

  async delete(tx: postgres.Sql, providerId: string, noteId: string): Promise<Result<{ deleted: true }>> {
    const result = await tx`
      DELETE FROM service_notes 
      WHERE note_id = ${noteId}::uuid AND provider_id = ${providerId}::uuid
    `;
    
    if (result.count === 0) return [new Error('Note not found or access denied'), null];
    return [null, { deleted: true }];
  },

  async list(tx: postgres.Sql, providerId: string, bookingId?: string): Promise<Result<NoteRow[]>> {
    const rows = await tx`
      SELECT sn.*, t.tag_id, t.name as tag_name, t.color as tag_color
      FROM service_notes sn
      LEFT JOIN note_tags nt ON nt.note_id = sn.note_id
      LEFT JOIN tags t ON t.tag_id = nt.tag_id
      WHERE sn.provider_id = ${providerId}::uuid
        ${bookingId ? tx`AND sn.booking_id = ${bookingId}::uuid` : tx``}
      ORDER BY sn.created_at DESC, t.name ASC
      LIMIT 200
    `;

    const noteMap = new Map<string, NoteRow & { _tags: Tag[] }>();
    for (const row of rows) {
      const noteId = String(row['note_id']);
      if (!noteMap.has(noteId)) {
        noteMap.set(noteId, {
          ...mapRowToNote(row),
          _tags: [],
          tags: [] // placeholder
        });
      }
      
      if (row['tag_id']) {
        noteMap.get(noteId)?._tags.push({
          tag_id: String(row['tag_id']),
          name: String(row['tag_name']),
          color: String(row['tag_color'])
        });
      }
    }

    const notes: NoteRow[] = Array.from(noteMap.values()).map(n => ({
      ...n,
      tags: n._tags,
    }));

    // Cleanup internal temporary field (handled by not including it in the final object if possible, 
    // but here we just return the notes without the _tags field in the type)
    return [null, notes];
  }
};

// ============================================================================
// ACTION HANDLERS (OCP / Strategy Pattern)
// ============================================================================
const ACTION_HANDLERS: Record<string, (tx: postgres.Sql, input: Input) => HandlerResult> = {
  create: async (tx, input) => {
    const { booking_id, client_id, content, tag_ids, provider_id } = input;
    if (!booking_id || !client_id || !content) {
      return [new Error('create requires booking_id, client_id, and content'), null];
    }
    return NoteRepository.create(tx, { provider_id, booking_id, client_id, content, tag_ids });
  },

  read: async (tx, input) => {
    if (!input.note_id) return [new Error('read requires note_id'), null];
    return NoteRepository.read(tx, input.provider_id, input.note_id);
  },

  update: async (tx, input) => {
    if (!input.note_id || !input.content) return [new Error('update requires note_id and content'), null];
    return NoteRepository.update(tx, input.provider_id, input.note_id, { content: input.content, tag_ids: input.tag_ids });
  },

  delete: async (tx, input) => {
    if (!input.note_id) return [new Error('delete requires note_id'), null];
    return NoteRepository.delete(tx, input.provider_id, input.note_id);
  },

  list: async (tx, input) => {
    const [err, notes] = await NoteRepository.list(tx, input.provider_id, input.booking_id);
    if (err) return [err, null];
    return [null, { notes: notes ?? [], count: notes?.length ?? 0 }];
  }
};

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

export async function main(args: any) : Promise<Result<unknown>> {
const rawInput: unknown = args;
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Input = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [txErr, txResult] = await withTenantContext<unknown>(sql, input.provider_id, async (tx) => {
      const handler = ACTION_HANDLERS[input.action];
      if (!handler) {
        return [new Error(`Unknown action: ${input.action}`), null];
      }
      return handler(tx, input);
    });

    if (txErr !== null) return [txErr, null];
    return [null, txResult];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`Internal error: ${msg}`), null];
  } finally {
    await sql.end();
  }
}