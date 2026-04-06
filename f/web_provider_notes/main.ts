// ============================================================================
// WEB PROVIDER NOTES — Clinical notes CRUD
// ============================================================================
// Create, read, update clinical notes for provider consultations.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  provider_user_id: z.uuid(),
  action: z.enum(['create', 'read', 'update', 'list']),
  note_id: z.uuid().optional(),
  booking_id: z.uuid().optional(),
  client_id: z.uuid().optional(),
  content: z.string().min(1).max(5000).optional(),
});

interface NoteResult {
  readonly note_id: string;
  readonly booking_id: string;
  readonly client_id: string;
  readonly provider_id: string;
  readonly content: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface NotesListResult {
  readonly notes: readonly NoteResult[];
  readonly message: string;
}

export async function main(rawInput: unknown): Promise<[Error | null, NoteResult | NotesListResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { provider_user_id, action } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    const providerRows = await sql`
      SELECT provider_id FROM providers
      WHERE email = (SELECT email FROM users WHERE user_id = ${provider_user_id}::uuid LIMIT 1)
         OR provider_id = ${provider_user_id}::uuid
      LIMIT 1
    `;

    const providerRow = providerRows[0];
    if (providerRow === undefined) {
      return [new Error('Provider record not found'), null];
    }

    const providerId = String(providerRow['provider_id']);

    switch (action) {
      case 'create': {
        const bookingId = parsed.data.booking_id;
        const content = parsed.data.content;
        if (bookingId === undefined || content === undefined) {
          return [new Error('booking_id and content are required for create'), null];
        }

        const bookingRows = await sql`
          SELECT client_id FROM bookings WHERE booking_id = ${bookingId}::uuid LIMIT 1
        `;

        const bRow = bookingRows[0];
        if (bRow === undefined) {
          return [new Error('Booking not found'), null];
        }

        const rows = await sql`
          INSERT INTO service_notes (booking_id, client_id, provider_id, content)
          VALUES (${bookingId}::uuid, ${String(bRow['client_id'])}::uuid, ${providerId}::uuid, ${content})
          RETURNING note_id, booking_id, client_id, provider_id, content, created_at, updated_at
        `;

        const newRow = rows[0];
        if (newRow === undefined) {
          return [new Error('Failed to create note'), null];
        }

        return [null, {
          note_id: String(newRow['note_id']),
          booking_id: String(newRow['booking_id']),
          client_id: String(newRow['client_id']),
          provider_id: String(newRow['provider_id']),
          content: String(newRow['content']),
          created_at: String(newRow['created_at']),
          updated_at: String(newRow['updated_at']),
        }];
      }

      case 'read': {
        const noteId = parsed.data.note_id;
        if (noteId === undefined) {
          return [new Error('note_id is required for read'), null];
        }

        const rows = await sql`
          SELECT note_id, booking_id, client_id, provider_id, content, created_at, updated_at
          FROM service_notes
          WHERE note_id = ${noteId}::uuid AND provider_id = ${providerId}::uuid
          LIMIT 1
        `;

        const row = rows[0];
        if (row === undefined) {
          return [new Error('Note not found'), null];
        }

        return [null, {
          note_id: String(row['note_id']),
          booking_id: String(row['booking_id']),
          client_id: String(row['client_id']),
          provider_id: String(row['provider_id']),
          content: String(row['content']),
          created_at: String(row['created_at']),
          updated_at: String(row['updated_at']),
        }];
      }

      case 'update': {
        const noteId = parsed.data.note_id;
        const content = parsed.data.content;
        if (noteId === undefined || content === undefined) {
          return [new Error('note_id and content are required for update'), null];
        }

        const rows = await sql`
          UPDATE service_notes SET content = ${content}, updated_at = NOW()
          WHERE note_id = ${noteId}::uuid AND provider_id = ${providerId}::uuid
          RETURNING note_id, booking_id, client_id, provider_id, content, created_at, updated_at
        `;

        const row = rows[0];
        if (row === undefined) {
          return [new Error('Note not found or not owned by this provider'), null];
        }

        return [null, {
          note_id: String(row['note_id']),
          booking_id: String(row['booking_id']),
          client_id: String(row['client_id']),
          provider_id: String(row['provider_id']),
          content: String(row['content']),
          created_at: String(row['created_at']),
          updated_at: String(row['updated_at']),
        }];
      }

      case 'list': {
        const clientId = parsed.data.client_id;
        if (clientId === undefined) {
          return [new Error('client_id is required for list'), null];
        }

        const rows = await sql`
          SELECT note_id, booking_id, client_id, provider_id, content, created_at, updated_at
          FROM service_notes
          WHERE client_id = ${clientId}::uuid AND provider_id = ${providerId}::uuid
          ORDER BY created_at DESC
          LIMIT 50
        `;

        const notes: NoteResult[] = [];
        for (const r of rows) {
          notes.push({
            note_id: String(r['note_id']),
            booking_id: String(r['booking_id']),
            client_id: String(r['client_id']),
            provider_id: String(r['provider_id']),
            content: String(r['content']),
            created_at: String(r['created_at']),
            updated_at: String(r['updated_at']),
          });
        }

        return [null, { notes: notes, message: 'OK' }];
      }

      default: {
        const _exhaustive: never = action;
        return [new Error(`Unknown action: ${String(_exhaustive)}`), null];
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
