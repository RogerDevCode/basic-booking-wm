import postgres from 'postgres';
import { type ClientMetadataRow, type ReminderPrefs, type SqlClient } from "./types.ts";

export async function loadPreferences(sql: SqlClient, clientId: string): Promise<ReminderPrefs> {
    const defaults: ReminderPrefs = {
            telegram_24h: true,
            gmail_24h: true,
            telegram_2h: true,
            telegram_30min: true,
          };
    try {
    const rows = await (sql as postgres.TransactionSql)<ClientMetadataRow[]>`
      SELECT metadata FROM clients WHERE client_id = ${clientId}::uuid LIMIT 1
    `;
    const firstRow = rows[0];
    if (!firstRow?.metadata) return defaults;

    const raw = firstRow.metadata;
    const reminderPrefsRaw = raw['reminder_preferences'];
    if (typeof reminderPrefsRaw !== 'object' || reminderPrefsRaw === null) return defaults;
    const reminderPrefs = reminderPrefsRaw as Readonly<Record<string, unknown>>;
    if (!reminderPrefs) return defaults;

    return {
      telegram_24h: Boolean(reminderPrefs['telegram_24h'] ?? true),
      gmail_24h: Boolean(reminderPrefs['gmail_24h'] ?? true),
      telegram_2h: Boolean(reminderPrefs['telegram_2h'] ?? true),
      telegram_30min: Boolean(reminderPrefs['telegram_30min'] ?? true),
    };
    } catch {
    return defaults;
    }
}
