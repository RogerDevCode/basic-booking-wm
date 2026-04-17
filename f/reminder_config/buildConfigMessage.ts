import { formatPrefs } from "./formatPrefs";
import { type ReminderPrefs } from "./types";

export function buildConfigMessage(prefs: ReminderPrefs): { message: string; reply_keyboard: string[][] } {
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
