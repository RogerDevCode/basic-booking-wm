// ============================================================================
// REMINDER CONFIG — Preference Configuration UI
// ============================================================================
// Allows clients to configure reminder preferences:
// - Channel toggles (Telegram, Gmail)
// - Time window toggles (24h, 2h, 30min)
// Uses reply_keyboard for selection and force_reply for custom input.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

type SqlClient = postgres.Sql | postgres.TransactionSql;

const InputSchema = z.object({
  action: z.enum(['show', 'toggle_channel', 'toggle_window', 'deactivate_all', 'activate_all', 'back']),
  client_id: z.string().optional(),
  channel: z.string().optional(),
  window: z.string().optional(),
});

type ReminderPrefs = {
  telegram_24h: boolean;
  gmail_24h: boolean;
  telegram_2h: boolean;
  telegram_30min: boolean;
};

function formatPrefs(prefs: ReminderPrefs): string {
  const check = (v: boolean) => v ? '✅' : '❌';
  return `📱 Telegram: ${check(prefs.telegram_24h)} (24h) ${check(prefs.telegram_2h)} (2h) ${check(prefs.telegram_30min)} (30min)\n📧 Email:    ${check(prefs.gmail_24h)} (24h)`;
}

function buildConfigMessage(prefs: ReminderPrefs): { message: string; reply_keyboard: string[][] } {
  const status = formatPrefs(prefs);
  return {
    message: `⚙️ *Preferencias de Recordatorios*\n\n${status}\n\nElige qué cambiar:`,
    reply_keyboard: [
      [`📱 Telegram ${prefs.telegram_24h ? 'ON' : 'OFF'}`, `📧 Email ${prefs.gmail_24h ? 'ON' : 'OFF'}`],
      ['⏰ Ventanas de tiempo', '🔕 Desactivar todo'],
      ['✅ Activar todo', '« Volver al menú'],
    ],
  };
}

function buildWindowConfig(prefs: ReminderPrefs): { message: string; reply_keyboard: string[][] } {
  const check = (v: boolean) => v ? '✅' : '❌';
  return {
    message: `⏰ *Ventanas de Recordatorio*\n\n24h antes: ${check(prefs.telegram_24h)}\n2h antes:  ${check(prefs.telegram_2h)}\n30min antes: ${check(prefs.telegram_30min)}\n\nToca para alternar:`,
    reply_keyboard: [
      [`24h ${prefs.telegram_24h ? '✅' : '❌'}`, `2h ${prefs.telegram_2h ? '✅' : '❌'}`, `30min ${prefs.telegram_30min ? '✅' : '❌'}`],
      ['« Volver', '🔕 Desactivar todo'],
    ],
  };
}

function toggleValue(prefs: ReminderPrefs, key: string): ReminderPrefs {
  const validKeys = ['telegram_24h', 'gmail_24h', 'telegram_2h', 'telegram_30min'];
  if (validKeys.includes(key)) {
    return { ...prefs, [key]: !prefs[key as keyof ReminderPrefs] };
  }
  return prefs;
}

function setAll(_prefs: ReminderPrefs, value: boolean): ReminderPrefs {
  return {
    telegram_24h: value,
    gmail_24h: value,
    telegram_2h: value,
    telegram_30min: value,
  };
}

async function savePreferences(sql: SqlClient, clientId: string, prefs: ReminderPrefs): Promise<boolean> {
  try {
    await sql`
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

interface ClientMetadataRow {
  readonly metadata: Readonly<Record<string, unknown>> | null;
}

interface ReminderConfigResult {
  readonly message: string;
  readonly reply_keyboard: string[][] | undefined;
  readonly preferences: ReminderPrefs;
}

async function loadPreferences(sql: SqlClient, clientId: string): Promise<ReminderPrefs> {
  const defaults: ReminderPrefs = {
    telegram_24h: true,
    gmail_24h: true,
    telegram_2h: true,
    telegram_30min: true,
  };

  try {
    const rows = await sql<ClientMetadataRow[]>`
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
      telegram_24h: Boolean(reminderPrefs.telegram_24h ?? true),
      gmail_24h: Boolean(reminderPrefs.gmail_24h ?? true),
      telegram_2h: Boolean(reminderPrefs.telegram_2h ?? true),
      telegram_30min: Boolean(reminderPrefs.telegram_30min ?? true),
    };
  } catch {
    return defaults;
  }
}

export async function main(rawInput: unknown): Promise<[Error | null, ReminderConfigResult | null]> {
  try {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return [new Error(`Invalid input: ${parsed.error.message}`), null];
    }

    const { action, client_id, channel, window } = parsed.data;

    if (!client_id) {
      return [new Error('client_id is required'), null];
    }

    const dbUrl = process.env['DATABASE_URL'];
    const sql = dbUrl ? createDbClient({ url: dbUrl }) : null;

    if (!sql) {
      return [new Error('No DB configured'), null];
    }

    const tenantId = client_id || '00000000-0000-0000-0000-000000000000';

    const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
      let prefs: ReminderPrefs = await loadPreferences(tx, client_id);
      let message = '';
      let reply_keyboard: string[][] | undefined;

      switch (action) {
        case 'show':
          ({ message, reply_keyboard } = buildConfigMessage(prefs));
          break;

        case 'toggle_channel': {
          if (channel === 'telegram') {
            const allOn = prefs.telegram_24h && prefs.telegram_2h && prefs.telegram_30min;
            prefs = { ...prefs, telegram_24h: !allOn, telegram_2h: !allOn, telegram_30min: !allOn };
          } else if (channel === 'gmail') {
            prefs = { ...prefs, gmail_24h: !prefs.gmail_24h };
          }
          await savePreferences(tx, client_id, prefs);
          ({ message, reply_keyboard } = buildConfigMessage(prefs));
          break;
        }

        case 'toggle_window': {
          if (window) {
            prefs = toggleValue(prefs, `telegram_${window}`);
            await savePreferences(tx, client_id, prefs);
          }
          ({ message, reply_keyboard } = buildWindowConfig(prefs));
          break;
        }

        case 'deactivate_all':
          prefs = setAll(prefs, false);
          await savePreferences(tx, client_id, prefs);
          message = '🔕 *Recordatorios desactivados*\n\nNo recibirás avisos automáticos.\n\nPara reactivarlos, toca "Activar todo".';
          reply_keyboard = [['✅ Activar todo', '« Volver al menú']];
          break;

        case 'activate_all':
          prefs = setAll(prefs, true);
          await savePreferences(tx, client_id, prefs);
          message = '🔔 *Recordatorios activados*\n\nRecibirás avisos en todos los canales y ventanas.';
          reply_keyboard = [['⚙️ Configurar', '« Volver al menú']];
          break;

        case 'back':
          message = '📋 Menú principal. ¿En qué puedo ayudarte?';
          reply_keyboard = [['📅 Agendar cita', '📋 Mis citas'], ['🔔 Recordatorios', '❓ Información']];
          break;
      }

      return [null, { message, reply_keyboard, preferences: prefs }];
    });

    await sql.end();

    if (txErr) return [new Error(txErr.message), null];
    if (txData === null) return [new Error('Operation failed'), null];
    return [null, txData];
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return [new Error(error.message), null];
  }
}
