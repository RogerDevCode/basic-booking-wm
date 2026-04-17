import { type ReminderPrefs } from "./types";

export function formatPrefs(prefs: ReminderPrefs): string {
    const check = (v: boolean) => v ? '✅' : '❌';
    return `📱 Telegram: ${check(prefs.telegram_24h)} (24h) ${check(prefs.telegram_2h)} (2h) ${check(prefs.telegram_30min)} (30min)\n📧 Email:    ${check(prefs.gmail_24h)} (24h)`;
}
