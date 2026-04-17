import postgres from 'postgres';
import { type ProfileResult } from "./types";

/**
 * Maps raw database row to strictly typed ProfileResult.
 */
export function mapToProfileResult(row: postgres.Row): ProfileResult {
    return {
    client_id: String(row['client_id']),
    name: String(row['name']),
    email: row['email'] ? String(row['email']) : null,
    phone: row['phone'] ? String(row['phone']) : null,
    telegram_chat_id: row['telegram_chat_id'] ? String(row['telegram_chat_id']) : null,
    timezone: String(row['timezone']),
    gcal_calendar_id: row['gcal_calendar_id'] ? String(row['gcal_calendar_id']) : null,
    };
}
