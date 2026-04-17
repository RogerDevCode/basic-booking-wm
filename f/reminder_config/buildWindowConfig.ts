import { type ReminderPrefs } from "./types";

export function buildWindowConfig(prefs: ReminderPrefs): { message: string; reply_keyboard: string[][] } {
    const check = (v: boolean) => v ? '✅' : '❌';
    return {
    message: `⏰ *Ventanas de Recordatorio*\n\n24h antes: ${check(prefs.telegram_24h)}\n2h antes:  ${check(prefs.telegram_2h)}\n30min antes: ${check(prefs.telegram_30min)}\n\nToca para alternar:`,
    reply_keyboard: [
      [`24h ${prefs.telegram_24h ? '✅' : '❌'}`, `2h ${prefs.telegram_2h ? '✅' : '❌'}`, `30min ${prefs.telegram_30min ? '✅' : '❌'}`],
      ['« Volver', '🔕 Desactivar todo'],
    ],
    };
}
