// ============================================================================
// WEB PROVIDER NOTES — Clinical notes CRUD
// ============================================================================
// Create, read, update clinical notes for provider consultations.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  provider_user_id: z.string().uuid(),
  action: z.enum(['create', 'read', 'update', 'list']),
  note_id: z.string().uuid().optional(),
  booking_id: z.string().uuid().optional(),
  patient_id: z.string().uuid().optional(),
  content: z.string().min(1).max(5000).optional(),
});

interface NoteResult {
  readonly note_id: string;
  readonly booking_id: string;
  readonly patient_id: string;
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

    if (action === 'create') {
      const bookingId = parsed.data.booking_id;
      const content = parsed.data.content;
      if (bookingId === undefined || content === undefined) {
        return [new Error('booking_id and content are required for create'), null];
      }

      const bookingRows = await sql`
        SELECT patient_id FROM bookings WHERE booking_id = ${bookingId}::uuid LIMIT 1
      `;

      const bRow = bookingRows[0];
      if (bRow === undefined) {
        return [new Error('Booking not found'), null];
      }

      const rows = await sql`
        INSERT INTO clinical_notes (booking_id, patient_id, provider_id, content)
        VALUES (${bookingId}::uuid, ${String(bRow['patient_id'])}::uuid, ${providerId}::uuid, ${content})
        RETURNING note_id, booking_id, patient_id, provider_id, content, created_at, updated_at
      `;

      const newRow = rows[0];
      if (newRow === undefined) {
        return [new Error('Failed to create note'), null];
      }

      return [null, {
        note_id: String(newRow['note_id']),
        booking_id: String(newRow['booking_id']),
        patient_id: String(newRow['patient_id']),
        provider_id: String(newRow['provider_id']),
        content: String(newRow['content']),
        created_at: String(newRow['created_at']),
        updated_at: String(newRow['updated_at']),
      }];
    }

    if (action === 'read') {
      const noteId = parsed.data.note_id;
      if (noteId === undefined) {
        return [new Error('note_id is required for read'), null];
      }

      const rows = await sql`
        SELECT note_id, booking_id, patient_id, provider_id, content, created_at, updated_at
        FROM clinical_notes
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
        patient_id: String(row['patient_id']),
        provider_id: String(row['provider_id']),
        content: String(row['content']),
        created_at: String(row['created_at']),
        updated_at: String(row['updated_at']),
      }];
    }

    if (action === 'update') {
      const noteId = parsed.data.note_id;
      const content = parsed.data.content;
      if (noteId === undefined || content === undefined) {
        return [new Error('note_id and content are required for update'), null];
      }

      const rows = await sql`
        UPDATE clinical_notes SET content = ${content}, updated_at = NOW()
        WHERE note_id = ${noteId}::uuid AND provider_id = ${providerId}::uuid
        RETURNING note_id, booking_id, patient_id, provider_id, content, created_at, updated_at
      `;

      const row = rows[0];
      if (row === undefined) {
        return [new Error('Note not found or not owned by this provider'), null];
      }

      return [null, {
        note_id: String(row['note_id']),
        booking_id: String(row['booking_id']),
        patient_id: String(row['patient_id']),
        provider_id: String(row['provider_id']),
        content: String(row['content']),
        created_at: String(row['created_at']),
        updated_at: String(row['updated_at']),
      }];
    }

    if (action === 'list') {
      const patientId = parsed.data.patient_id;
      if (patientId === undefined) {
        return [new Error('patient_id is required for list'), null];
      }

      const rows = await sql`
        SELECT note_id, booking_id, patient_id, provider_id, content, created_at, updated_at
        FROM clinical_notes
        WHERE patient_id = ${patientId}::uuid AND provider_id = ${providerId}::uuid
        ORDER BY created_at DESC
        LIMIT 50
      `;

      const notes: NoteResult[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r === undefined) continue;
        notes.push({
          note_id: String(r['note_id']),
          booking_id: String(r['booking_id']),
          patient_id: String(r['patient_id']),
          provider_id: String(r['provider_id']),
          content: String(r['content']),
          created_at: String(r['created_at']),
          updated_at: String(r['updated_at']),
        });
      }

      return [null, { notes: notes, message: 'OK' }];
    }

    return [new Error('Unknown action: ' + String(action)), null];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
