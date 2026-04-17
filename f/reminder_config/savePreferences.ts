import postgres from 'postgres';
import { type ReminderPrefs, type SqlClient } from "./types";

export async function savePreferences(sql: SqlClient, clientId: string, prefs: ReminderPrefs): Promise<boolean> {
    try {
    await (sql as postgres.TransactionSql)`
      UPDATE clients
      SET metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{reminder_preferences}',
            ${JSON.stringify(prefs)}::jsonb
          ),
          updated_at = NOW()
      WHERE client_id = ${clientId}::uuid
    `;
    return true;
    } catch {
    return false;
    }
}
