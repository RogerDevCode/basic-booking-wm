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
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  provider_id: z.uuid(),
  action: z.enum(['create', 'read', 'update', 'delete', 'list']),
  note_id: z.uuid().optional(),
  booking_id: z.uuid().optional(),
  client_id: z.uuid().optional(),
  content: z.string().min(1).max(5000).optional(),
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
}

type Result<T> = [Error | null, T | null];

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
  tx: postgres.TransactionSql,
  providerId: string,
  bookingId: string,
  clientId: string,
  content: string
): Promise<Result<NoteRow>> {
  const { encrypted, version } = encryptContent(content);

  const rows = await tx.values<[string, string, string, string, string | null, number, string, string][]>`
    INSERT INTO service_notes (provider_id, booking_id, client_id, content_encrypted, encryption_version)
    VALUES (${providerId}::uuid, ${bookingId}::uuid, ${clientId}::uuid, ${encrypted}, ${version})
    RETURNING note_id, booking_id, client_id, provider_id, content_encrypted, encryption_version, created_at, updated_at
  `;
  const row = rows[0];

  if (row === undefined) return [new Error('create_failed: no row returned'), null];

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
  }];
}

// ============================================================================
// READ note (decrypt content)
// ============================================================================

async function readNote(tx: postgres.TransactionSql, providerId: string, noteId: string): Promise<Result<NoteRow>> {
  const rows = await tx.values<[string, string, string, string, string | null, number, string, string][]>`
    SELECT note_id, booking_id, client_id, provider_id, content_encrypted, encryption_version, created_at, updated_at
    FROM service_notes
    WHERE note_id = ${noteId}::uuid AND provider_id = ${providerId}::uuid
    LIMIT 1
  `;
  const row = rows[0];

  if (row === undefined) return [new Error('Note not found or access denied'), null];

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
  }];
}

// ============================================================================
// UPDATE note (re-encrypt)
// ============================================================================

async function updateNote(
  tx: postgres.TransactionSql,
  providerId: string,
  noteId: string,
  content: string
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
  }];
}

// ============================================================================
// DELETE note
// ============================================================================

async function deleteNote(tx: postgres.TransactionSql, providerId: string, noteId: string): Promise<Result<{ readonly deleted: boolean }>> {
  await tx`DELETE FROM service_notes WHERE note_id = ${noteId}::uuid AND provider_id = ${providerId}::uuid`;
  return [null, { deleted: true }];
}

// ============================================================================
// LIST notes for a booking (decrypt all)
// ============================================================================

async function listNotes(
  tx: postgres.TransactionSql,
  providerId: string,
  bookingId?: string
): Promise<Result<NoteRow[]>> {
  let rows: [string, string, string, string, string | null, number, string, string][];
  if (bookingId != null) {
    rows = await tx.values<[string, string, string, string, string | null, number, string, string][]>`
      SELECT note_id, booking_id, client_id, provider_id, content_encrypted, encryption_version, created_at, updated_at
      FROM service_notes
      WHERE provider_id = ${providerId}::uuid AND booking_id = ${bookingId}::uuid
      ORDER BY created_at DESC
    `;
  } else {
    rows = await tx.values<[string, string, string, string, string | null, number, string, string][]>`
      SELECT note_id, booking_id, client_id, provider_id, content_encrypted, encryption_version, created_at, updated_at
      FROM service_notes
      WHERE provider_id = ${providerId}::uuid
      ORDER BY created_at DESC
      LIMIT 100
    `;
  }

  const notes: NoteRow[] = rows.map((row) => ({
    note_id: row[0],
    booking_id: row[1],
    client_id: row[2],
    provider_id: row[3],
    content_encrypted: row[4],
    encryption_version: row[5],
    created_at: row[6],
    updated_at: row[7],
    content: decryptContent(row[4]),
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

  const tenantId = input.provider_id ?? '00000000-0000-0000-0000-000000000000';

  try {
    const [txErr, txResult] = await withTenantContext(sql, tenantId, async (tx) => {
      if (input.action === 'create') {
        const bookingId = input.booking_id;
        const clientId = input.client_id;
        const content = input.content;
        if (bookingId == null || clientId == null || content == null) {
          return [new Error('create requires booking_id, client_id, and content'), null];
        }
        return createNote(tx, input.provider_id, bookingId, clientId, content);
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
        return updateNote(tx, input.provider_id, noteId, content);
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
