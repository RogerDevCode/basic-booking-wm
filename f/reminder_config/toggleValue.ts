import { type ReminderPrefs } from "./types.ts";

export function toggleValue(prefs: ReminderPrefs, key: string): ReminderPrefs {
    const validKeys = ['telegram_24h', 'gmail_24h', 'telegram_2h', 'telegram_30min'];
    if (validKeys.includes(key)) {
    return { ...prefs, [key]: !prefs[key as keyof ReminderPrefs] };
    }

    return prefs;
}
