import { decryptContent } from "./decryptContent";
import { type NoteRow, type Tag } from "./types";

export function mapRowToNote(row: any, tags: readonly Tag[] = []): NoteRow {
    return {
    note_id: row.note_id,
    booking_id: row.booking_id,
    client_id: row.client_id,
    provider_id: row.provider_id,
    content_encrypted: row.content_encrypted,
    encryption_version: row.encryption_version,
    created_at: row.created_at,
    updated_at: row.updated_at,
    content: decryptContent(row.content_encrypted),
    tags,
    };
}
