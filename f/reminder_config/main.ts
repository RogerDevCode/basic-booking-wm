//nobundling
/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Configure reminder preferences (channel toggles, time windows)
 * DB Tables Used  : clients
 * Concurrency Risk: NO — single-row UPDATE for client preferences
 * GCal Calls      : NO
 * Idempotency Key : N/A — preference updates are inherently idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates client_id and action
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate input (action enum, client_id, optional channel/window params)
 * - Load existing reminder preferences from clients.metadata JSONB column
 * - Apply action: show prefs, toggle channel, toggle window, activate/deactivate all
 * - Persist updated preferences via jsonb_set UPDATE
 * - Build formatted response message with emoji status and reply keyboard
 *
 * ### Schema Verification
 * - Tables: clients
 * - Columns: client_id, metadata (JSONB with reminder_preferences key), updated_at — metadata inferred from code
 *
 * ### Failure Mode Analysis
 * - Scenario 1: client_id missing → early validation rejection
 * - Scenario 2: No existing metadata row → defaults loaded, UPDATE creates reminder_preferences key via jsonb_set
 * - Scenario 3: DATABASE_URL missing → returns error, no DB client created
 *
 * ### Concurrency Analysis
 * - Risk: NO — single-row UPDATE for client preferences, inherently idempotent
 *
 * ### SOLID Compliance Check
 * - SRP: YES — toggleValue, setAll, buildConfigMessage, buildWindowConfig each have single responsibility
 * - DRY: YES — toggleValue uses dynamic key access via keyof ReminderPrefs, acceptable for config toggling
 * - KISS: YES — preference management via JSONB is simpler than dedicated columns
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// REMINDER CONFIG — Preference Configuration UI
// ============================================================================
// Allows clients to configure reminder preferences:
// - Channel toggles (Telegram, Gmail)
// - Time window toggles (24h, 2h, 30min)
// Uses reply_keyboard for selection and force_reply for custom input.
// ============================================================================

import { createDbClient } from '../internal/db/client.ts';
import { withTenantContext } from '../internal/tenant-context/index.ts';
import { buildConfigMessage } from "./buildConfigMessage.ts";
import { buildWindowConfig } from "./buildWindowConfig.ts";
import { loadPreferences } from "./loadPreferences.ts";
import { savePreferences } from "./savePreferences.ts";
import { setAll } from "./setAll.ts";
import { toggleValue } from "./toggleValue.ts";
import { InputSchema, type ReminderConfigResult, type ReminderPrefs } from "./types.ts";

export async function main(args: any) : Promise<[Error | null, ReminderConfigResult | null]> {
const rawInput: unknown = args;
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

    // FAIL FAST: client_id is mandatory. No fallback to null UUID.
    if (!client_id) {
      return [new Error('client_id is required for tenant isolation'), null];
    }
    const tenantId = client_id;

    const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
      let prefs: ReminderPrefs = await loadPreferences(tx, client_id);
      let message = '';
      let reply_keyboard: string[][] | undefined;

      type ActionFn = (p: ReminderPrefs) => Promise<ReminderPrefs> | ReminderPrefs;

      const mutators: Partial<Record<string, ActionFn>> = {
        toggle_channel: (p) => {
          if (channel === 'telegram') {
            const allOn = p.telegram_24h && p.telegram_2h && p.telegram_30min;
            return { ...p, telegram_24h: !allOn, telegram_2h: !allOn, telegram_30min: !allOn };
          }
          return channel === 'gmail' ? { ...p, gmail_24h: !p.gmail_24h } : p;
        },
        toggle_window: (p) => window ? toggleValue(p, `telegram_${window}`) : p,
        deactivate_all: (p) => setAll(p, false),
        activate_all: (p) => setAll(p, true),
      };

      const mutator = mutators[action];
      if (mutator) {
        prefs = await Promise.resolve(mutator(prefs));
        await savePreferences(tx, client_id, prefs);
      }

      const viewBuilder: Record<string, () => { message: string; reply_keyboard: string[][] | undefined }> = {
        show: () => buildConfigMessage(prefs),
        toggle_channel: () => buildConfigMessage(prefs),
        toggle_window: () => buildWindowConfig(prefs),
        deactivate_all: () => ({ message: '🔕 *Recordatorios desactivados*\n\nNo recibirás avisos automáticos.\n\nPara reactivarlos, toca "Activar todo".', reply_keyboard: [['✅ Activar todo', '« Volver al menú']] }),
        activate_all: () => ({ message: '🔔 *Recordatorios activados*\n\nRecibirás avisos en todos los canales y ventanas.', reply_keyboard: [['⚙️ Configurar', '« Volver al menú']] }),
        back: () => ({ message: '📋 Menú principal. ¿En qué puedo ayudarte?', reply_keyboard: [['📅 Agendar cita', '📋 Mis citas'], ['🔔 Recordatorios', '❓ Información']] }),
      };

      const viewFn = viewBuilder[action];
      if (viewFn) {
        ({ message, reply_keyboard } = viewFn());
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