import { decryptContent } from "./decryptContent.ts";
import { type NoteRow, type Tag } from "./types.ts";

export function mapRowToNote(row: Record<string, unknown>, tags: readonly Tag[] = []): NoteRow {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const bookingId: string | null = (row['booking_id'] !== null && row['booking_id'] !== undefined) ? String(row['booking_id']) : null;
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const clientId: string | null = (row['client_id'] !== null && row['client_id'] !== undefined) ? String(row['client_id']) : null;
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const contentEncrypted: string | null = (row['content_encrypted'] !== null && row['content_encrypted'] !== undefined) ? String(row['content_encrypted']) : null;

    return {
    note_id: String(row['note_id']),
    booking_id: bookingId,
    client_id: clientId,
    provider_id: String(row['provider_id']),
    content_encrypted: contentEncrypted,
    encryption_version: Number(row['encryption_version']),
    created_at: row['created_at'] instanceof Date ? row['created_at'] : String(row['created_at']),
    updated_at: row['updated_at'] instanceof Date ? row['updated_at'] : String(row['updated_at']),
    content: decryptContent(contentEncrypted),
    tags,
    };
}
