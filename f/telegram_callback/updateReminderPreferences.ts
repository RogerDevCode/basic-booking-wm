import postgres from 'postgres';

export async function updateReminderPreferences(tx: postgres.Sql, clientId: string, activate: boolean): Promise<[Error | null, boolean]> {
    const defaults = activate
            ? '{"telegram_24h": true, "gmail_24h": true, "telegram_2h": true, "telegram_30min": true}'
            : '{"telegram_24h": false, "gmail_24h": false, "telegram_2h": false, "telegram_30min": false}';
    await tx`
    UPDATE clients
    SET metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{reminder_preferences}',
          ${defaults}::jsonb
        ),
        updated_at = NOW()
    WHERE client_id = ${clientId}::uuid
  `;
    return [null, true];
}
