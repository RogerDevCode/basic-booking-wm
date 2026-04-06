// ============================================================================
// WEB PROVIDER NOTES — Clinical notes CRUD with AES-256-GCM encryption
// ============================================================================
// Notes are encrypted at rest so only the owning provider can read them.
// Admins cannot decrypt note content even with direct DB access.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { encryptData, decryptData } from '../internal/crypto';

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
  readonly content: string;  // Decrypted content (only available after read)
  readonly encryption_version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

type Result<T> = [Error | null, T | null];

function getDb(): postgres.Sql {
  const url = process.env['DATABASE_URL'];
  if (url == null || url === '') throw new Error('CONFIGURATION_ERROR: DATABASE_URL is required');
  return postgres(url, { ssl: 'require' });
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
  sql: postgres.Sql,
  providerId: string,
  bookingId: string,
  clientId: string,
  content: string
): Promise<Result<NoteRow>> {
  try {
    const { encrypted, version } = encryptContent(content);

    const rows = await sql`
      INSERT INTO service_notes (provider_id, booking_id, client_id, content_encrypted, encryption_version)
      VALUES (${providerId}::uuid, ${bookingId}::uuid, ${clientId}::uuid, ${encrypted}, ${version})
      RETURNING note_id, booking_id, client_id, provider_id, content_encrypted, encryption_version, created_at, updated_at
    `;
    const row = rows[0] as {
      note_id: string;
      booking_id: string;
      client_id: string;
      provider_id: string;
      content_encrypted: string | null;
      encryption_version: number;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (row == null) return [new Error('create_failed: no row returned'), null];

    return [null, {
      ...row,
      content: content,  // Return plaintext to the creator
    }];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`create_failed: ${msg}`), null];
  }
}

// ============================================================================
// READ note (decrypt content)
// ============================================================================

async function readNote(sql: postgres.Sql, providerId: string, noteId: string): Promise<Result<NoteRow>> {
  try {
    const rows = await sql`
      SELECT note_id, booking_id, client_id, provider_id, content_encrypted, encryption_version, created_at, updated_at
      FROM service_notes
      WHERE note_id = ${noteId}::uuid AND provider_id = ${providerId}::uuid
      LIMIT 1
    `;
    const row = rows[0] as {
      note_id: string;
      booking_id: string;
      client_id: string;
      provider_id: string;
      content_encrypted: string | null;
      encryption_version: number;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (row == null) return [new Error('Note not found or access denied'), null];

    return [null, {
      ...row,
      content: decryptContent(row.content_encrypted),
    }];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`read_failed: ${msg}`), null];
  }
}

// ============================================================================
// UPDATE note (re-encrypt)
// ============================================================================

async function updateNote(
  sql: postgres.Sql,
  providerId: string,
  noteId: string,
  content: string
): Promise<Result<NoteRow>> {
  try {
    const { encrypted, version } = encryptContent(content);

    const rows = await sql`
      UPDATE service_notes
      SET content_encrypted = ${encrypted}, encryption_version = ${version}, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid AND provider_id = ${providerId}::uuid
      RETURNING note_id, booking_id, client_id, provider_id, content_encrypted, encryption_version, created_at, updated_at
    `;
    const row = rows[0] as {
      note_id: string;
      booking_id: string;
      client_id: string;
      provider_id: string;
      content_encrypted: string | null;
      encryption_version: number;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (row == null) return [new Error('Note not found or access denied'), null];

    return [null, {
      ...row,
      content: content,
    }];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`update_failed: ${msg}`), null];
  }
}

// ============================================================================
// DELETE note
// ============================================================================

async function deleteNote(sql: postgres.Sql, providerId: string, noteId: string): Promise<Result<{ readonly deleted: boolean }>> {
  try {
    await sql`DELETE FROM service_notes WHERE note_id = ${noteId}::uuid AND provider_id = ${providerId}::uuid`;
    return [null, { deleted: true }];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`delete_failed: ${msg}`), null];
  }
}

// ============================================================================
// LIST notes for a booking (decrypt all)
// ============================================================================

async function listNotes(
  sql: postgres.Sql,
  providerId: string,
  bookingId?: string
): Promise<Result<NoteRow[]>> {
  try {
    let rows;
    if (bookingId != null) {
      rows = await sql`
        SELECT note_id, booking_id, client_id, provider_id, content_encrypted, encryption_version, created_at, updated_at
        FROM service_notes
        WHERE provider_id = ${providerId}::uuid AND booking_id = ${bookingId}::uuid
        ORDER BY created_at DESC
      `;
    } else {
      rows = await sql`
        SELECT note_id, booking_id, client_id, provider_id, content_encrypted, encryption_version, created_at, updated_at
        FROM service_notes
        WHERE provider_id = ${providerId}::uuid
        ORDER BY created_at DESC
        LIMIT 100
      `;
    }

    const notes: NoteRow[] = (rows as unknown as Array<{
      note_id: string;
      booking_id: string;
      client_id: string;
      provider_id: string;
      content_encrypted: string | null;
      encryption_version: number;
      created_at: string;
      updated_at: string;
    }>).map(row => ({
      ...row,
      content: decryptContent(row.content_encrypted),
    }));

    return [null, notes];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`list_failed: ${msg}`), null];
  }
}

// ============================================================================
// MAIN
// ============================================================================

export async function main(rawInput: unknown): Promise<{ readonly success: boolean; readonly data: unknown | null; readonly error_message: string | null }> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };

  const input = parsed.data;
  const sql = getDb();

  try {
    if (input.action === 'create') {
      const bookingId = input.booking_id;
      const clientId = input.client_id;
      const content = input.content;
      if (bookingId == null || clientId == null || content == null) {
        return { success: false, data: null, error_message: 'create requires booking_id, client_id, and content' };
      }
      const [err, result] = await createNote(sql, input.provider_id, bookingId, clientId, content);
      if (err != null) return { success: false, data: null, error_message: err.message };
      return { success: true, data: result, error_message: null };
    }

    if (input.action === 'read') {
      const noteId = input.note_id;
      if (noteId == null) return { success: false, data: null, error_message: 'read requires note_id' };
      const [err, result] = await readNote(sql, input.provider_id, noteId);
      if (err != null) return { success: false, data: null, error_message: err.message };
      return { success: true, data: result, error_message: null };
    }

    if (input.action === 'update') {
      const noteId = input.note_id;
      const content = input.content;
      if (noteId == null || content == null) return { success: false, data: null, error_message: 'update requires note_id and content' };
      const [err, result] = await updateNote(sql, input.provider_id, noteId, content);
      if (err != null) return { success: false, data: null, error_message: err.message };
      return { success: true, data: result, error_message: null };
    }

    if (input.action === 'delete') {
      const noteId = input.note_id;
      if (noteId == null) return { success: false, data: null, error_message: 'delete requires note_id' };
      const [err, result] = await deleteNote(sql, input.provider_id, noteId);
      if (err != null) return { success: false, data: null, error_message: err.message };
      return { success: true, data: result, error_message: null };
    }

    if (input.action === 'list') {
      const [err, result] = await listNotes(sql, input.provider_id, input.booking_id);
      if (err != null) return { success: false, data: null, error_message: err.message };
      const notes = result ?? [];
      return { success: true, data: { notes, count: notes.length }, error_message: null };
    }

    return { success: false, data: null, error_message: `Unknown action: ${input.action}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: `Internal error: ${msg}` };
  } finally {
    await sql.end();
  }
}
