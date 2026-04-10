/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Clinical notes CRUD with AES-256-GCM encryption at rest
 * DB Tables Used  : service_notes, providers, services
 * Concurrency Risk: NO — single-row CRUD operations per note
 * GCal Calls      : NO
 * Idempotency Key : N/A — note CRUD is inherently non-idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates action and note fields
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate action (create/read/update/delete/list) and note fields via Zod
 * - Encrypt content with AES-256-GCM before insert, decrypt after read
 * - Route to action-specific handler, each enforcing provider_id ownership check
 * - Manage tags via note_tags join table (assign on create, replace on update, fetch on read/list)
 *
 * ### Schema Verification
 * - Tables: service_notes, note_tags, tags
 * - Columns: service_notes (note_id, provider_id, booking_id, client_id, content_encrypted, encryption_version, created_at, updated_at), note_tags (note_id, tag_id), tags (tag_id, name, color)
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Decryption failure → returns placeholder "[ERROR: Unable to decrypt note]" instead of crashing
 * - Scenario 2: Note not found or wrong provider → ownership WHERE clause returns empty, mapped to access denied
 * - Scenario 3: Missing required params for action → early return with specific field requirement error
 *
 * ### Concurrency Analysis
 * - Risk: NO — single-row CRUD operations per note, tag operations use ON CONFLICT DO NOTHING
 *
 * ### SOLID Compliance Check
 * - SRP: YES — each action handler (createNote, readNote, updateNote, deleteNote, listNotes) does one thing; tag helpers extracted
 * - DRY: YES — encryptContent/decryptContent shared across handlers, getNoteTags reused by all read paths
 * - KISS: YES — straightforward action dispatch via if-chain, tag grouping via Map in listNotes is minimal necessary complexity
 *
 * → CLEARED FOR CODE GENERATION
 */

import { withTenantContext } from '../internal/tenant-context';
// ============================================================================
// WEB PROVIDER NOTES — Clinical notes CRUD with AES-256-GCM encryption
// ============================================================================
// Notes are encrypted at rest so only the owning provider can read them.
// Admins cannot decrypt note content even with direct DB access.
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { encryptData, decryptData } from '../internal/crypto';

import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';

const InputSchema = z.object({
  provider_id: z.uuid(),
  action: z.enum(['create', 'read', 'update', 'delete', 'list']),
  note_id: z.uuid().optional(),
  booking_id: z.uuid().optional(),
  client_id: z.uuid().optional(),
  content: z.string().min(1).max(5000).optional(),
  tag_ids: z.array(z.uuid()).optional().default([]),
});

interface NoteRow {
  readonly note_id: string;
  readonly booking_id: string;
  readonly client_id: string;
  readonly provider_id: string;
  readonly content_encrypted: string | null;
  readonly content: string;
  readonly encryption_version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly tags: readonly { readonly tag_id: string; readonly name: string; readonly color: string }[];
}

// ============================================================================
// TAG HELPERS
// ============================================================================

async function assignTags(tx: postgres.Sql, noteId: string, tagIds: readonly string[]): Promise<Result<true>> {
  for (const tagId of tagIds) {
    await tx`
      INSERT INTO note_tags (note_id, tag_id)
      VALUES (${noteId}::uuid, ${tagId}::uuid)
      ON CONFLICT (note_id, tag_id) DO NOTHING
    `;
  }
  return [null, true];
}

async function getNoteTags(tx: postgres.Sql, noteId: string): Promise<Result<{ tag_id: string; name: string; color: string }[]>> {
  const rows = await tx.values<[string, string, string][]>`
    SELECT t.tag_id, t.name, t.color
    FROM note_tags nt
    JOIN tags t ON t.tag_id = nt.tag_id
    WHERE nt.note_id = ${noteId}::uuid
    ORDER BY t.name ASC
  `;
  return [null, rows.map((row) => ({ tag_id: row[0], name: row[1], color: row[2] }))];
}

// ============================================================================
// ENCRYPT content before storing
// ============================================================================

function encryptContent(plainContent: string): { readonly encrypted: string; readonly version: number } {
  const encrypted = encryptData(plainContent);
  return { encrypted, version: 1 };
}

// ============================================================================
// DECRYPT content after reading
// ============================================================================

function decryptContent(encrypted: string | null): string {
  if (encrypted == null) return '';
  try {
    return decryptData(encrypted);
  } catch {
    return '[ERROR: Unable to decrypt note]';
  }
}

// ============================================================================
// CREATE note (encrypted)
// ============================================================================

async function createNote(
  tx: postgres.Sql,
  providerId: string,
  bookingId: string,
  clientId: string,
  content: string,
  tagIds: readonly string[],
): Promise<Result<NoteRow>> {
  const { encrypted, version } = encryptContent(content);

  const rows = await tx.values<[string, string, string, string, string | null, number, string, string][]>`
    INSERT INTO service_notes (provider_id, booking_id, client_id, content_encrypted, encryption_version)
    VALUES (${providerId}::uuid, ${bookingId}::uuid, ${clientId}::uuid, ${encrypted}, ${version})
    RETURNING note_id, booking_id, client_id, provider_id, content_encrypted, encryption_version, created_at, updated_at
  `;
  const row = rows[0];

  if (row === undefined) return [new Error('create_failed: no row returned'), null];

  // Assign tags
  if (tagIds.length > 0) {
    await assignTags(tx, row[0], tagIds);
  }

  // Get tags for response
  const [_tagErr, tags] = await getNoteTags(tx, row[0]);

  return [null, {
    note_id: row[0],
    booking_id: row[1],
    client_id: row[2],
    provider_id: row[3],
    content_encrypted: row[4],
    encryption_version: row[5],
    created_at: row[6],
    updated_at: row[7],
    content: content,
    tags: tags ?? [],
  }];
}

// ============================================================================
// READ note (decrypt content)
// ============================================================================

async function readNote(tx: postgres.Sql, providerId: string, noteId: string): Promise<Result<NoteRow>> {
  const rows = await tx.values<[string, string, string, string, string | null, number, string, string][]>`
    SELECT note_id, booking_id, client_id, provider_id, content_encrypted, encryption_version, created_at, updated_at
    FROM service_notes
    WHERE note_id = ${noteId}::uuid AND provider_id = ${providerId}::uuid
    LIMIT 1
  `;
  const row = rows[0];

  if (row === undefined) return [new Error('Note not found or access denied'), null];

  const [_tagErr, tags] = await getNoteTags(tx, row[0]);

  return [null, {
    note_id: row[0],
    booking_id: row[1],
    client_id: row[2],
    provider_id: row[3],
    content_encrypted: row[4],
    encryption_version: row[5],
    created_at: row[6],
    updated_at: row[7],
    content: decryptContent(row[4]),
    tags: tags ?? [],
  }];
}

// ============================================================================
// UPDATE note (re-encrypt)
// ============================================================================

async function updateNote(
  tx: postgres.Sql,
  providerId: string,
  noteId: string,
  content: string,
  tagIds: readonly string[],
): Promise<Result<NoteRow>> {
  const { encrypted, version } = encryptContent(content);

  const rows = await tx.values<[string, string, string, string, string | null, number, string, string][]>`
    UPDATE service_notes
    SET content_encrypted = ${encrypted}, encryption_version = ${version}, updated_at = NOW()
    WHERE note_id = ${noteId}::uuid AND provider_id = ${providerId}::uuid
    RETURNING note_id, booking_id, client_id, provider_id, content_encrypted, encryption_version, created_at, updated_at
  `;
  const row = rows[0];

  if (row === undefined) return [new Error('Note not found or access denied'), null];

  // Replace tags
  await tx`DELETE FROM note_tags WHERE note_id = ${noteId}::uuid`;
  if (tagIds.length > 0) {
    await assignTags(tx, noteId, tagIds);
  }

  const [_tagErr, tags] = await getNoteTags(tx, noteId);

  return [null, {
    note_id: row[0],
    booking_id: row[1],
    client_id: row[2],
    provider_id: row[3],
    content_encrypted: row[4],
    encryption_version: row[5],
    created_at: row[6],
    updated_at: row[7],
    content: content,
    tags: tags ?? [],
  }];
}

// ============================================================================
// DELETE note
// ============================================================================

async function deleteNote(tx: postgres.Sql, providerId: string, noteId: string): Promise<Result<{ readonly deleted: boolean }>> {
  await tx`DELETE FROM service_notes WHERE note_id = ${noteId}::uuid AND provider_id = ${providerId}::uuid`;
  return [null, { deleted: true }];
}

// ============================================================================
// LIST notes for a booking (decrypt all)
// ============================================================================

async function listNotes(
  tx: postgres.Sql,
  providerId: string,
  bookingId?: string
): Promise<Result<NoteRow[]>> {
  // Fetch notes with tags in a single query
  let rows: [string, string, string, string, string | null, number, string, string, string | null, string | null, string | null][];
  if (bookingId != null) {
    rows = await tx.values<[string, string, string, string, string | null, number, string, string, string | null, string | null, string | null][]>`
      SELECT sn.note_id, sn.booking_id, sn.client_id, sn.provider_id, sn.content_encrypted,
             sn.encryption_version, sn.created_at, sn.updated_at,
             t.tag_id, t.name, t.color
      FROM service_notes sn
      LEFT JOIN note_tags nt ON nt.note_id = sn.note_id
      LEFT JOIN tags t ON t.tag_id = nt.tag_id
      WHERE sn.provider_id = ${providerId}::uuid
        AND sn.booking_id = ${bookingId}::uuid
      ORDER BY sn.created_at DESC, t.name ASC
    `;
  } else {
    rows = await tx.values<[string, string, string, string, string | null, number, string, string, string | null, string | null, string | null][]>`
      SELECT sn.note_id, sn.booking_id, sn.client_id, sn.provider_id, sn.content_encrypted,
             sn.encryption_version, sn.created_at, sn.updated_at,
             t.tag_id, t.name, t.color
      FROM service_notes sn
      LEFT JOIN note_tags nt ON nt.note_id = sn.note_id
      LEFT JOIN tags t ON t.tag_id = nt.tag_id
      WHERE sn.provider_id = ${providerId}::uuid
      ORDER BY sn.created_at DESC, t.name ASC
      LIMIT 100
    `;
  }

  // Group by note_id using mutable intermediate
  interface MutableNote {
    note_id: string;
    booking_id: string;
    client_id: string;
    provider_id: string;
    content_encrypted: string | null;
    encryption_version: number;
    created_at: string;
    updated_at: string;
    content: string;
    tags: { tag_id: string; name: string; color: string }[];
  }
  const noteMap = new Map<string, MutableNote>();
  for (const row of rows) {
    const noteId = row[0];
    if (!noteMap.has(noteId)) {
      noteMap.set(noteId, {
        note_id: row[0],
        booking_id: row[1],
        client_id: row[2],
        provider_id: row[3],
        content_encrypted: row[4],
        encryption_version: row[5],
        created_at: row[6],
        updated_at: row[7],
        content: decryptContent(row[4]),
        tags: [],
      });
    }
    const note = noteMap.get(noteId);
    if (note != null && row[8] !== null && row[9] !== null && row[10] !== null) {
      note.tags.push({ tag_id: row[8], name: row[9], color: row[10] });
    }
  }

  // Convert to immutable NoteRow[]
  const notes: NoteRow[] = Array.from(noteMap.values()).map(n => ({
    note_id: n.note_id,
    booking_id: n.booking_id,
    client_id: n.client_id,
    provider_id: n.provider_id,
    content_encrypted: n.content_encrypted,
    encryption_version: n.encryption_version,
    created_at: n.created_at,
    updated_at: n.updated_at,
    content: n.content,
    tags: n.tags,
  }));
  return [null, notes];
}

// ============================================================================
// MAIN
// ============================================================================

export async function main(rawInput: unknown): Promise<[Error | null, unknown | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  const tenantId = input.provider_id;

  try {
    const [txErr, txResult] = await withTenantContext<unknown>(sql, tenantId, async (tx) => {
      if (input.action === 'create') {
        const bookingId = input.booking_id;
        const clientId = input.client_id;
        const content = input.content;
        if (bookingId == null || clientId == null || content == null) {
          return [new Error('create requires booking_id, client_id, and content'), null];
        }
        return createNote(tx, input.provider_id, bookingId, clientId, content, input.tag_ids);
      }

      if (input.action === 'read') {
        const noteId = input.note_id;
        if (noteId == null) return [new Error('read requires note_id'), null];
        return readNote(tx, input.provider_id, noteId);
      }

      if (input.action === 'update') {
        const noteId = input.note_id;
        const content = input.content;
        if (noteId == null || content == null) return [new Error('update requires note_id and content'), null];
        return updateNote(tx, input.provider_id, noteId, content, input.tag_ids);
      }

      if (input.action === 'delete') {
        const noteId = input.note_id;
        if (noteId == null) return [new Error('delete requires note_id'), null];
        return deleteNote(tx, input.provider_id, noteId);
      }

      if (input.action === 'list') {
        const [err, result] = await listNotes(tx, input.provider_id, input.booking_id);
        if (err != null) return [err, null];
        const notes = result ?? [];
        return [null, { notes, count: notes.length }];
      }

      return [new Error(`Unknown action: ${input.action}`), null];
    });

    if (txErr !== null) return [txErr, null];
    if (txResult === null) return [new Error('Operation failed'), null];
    return [null, txResult];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`Internal error: ${msg}`), null];
  } finally {
    await sql.end();
  }
}
