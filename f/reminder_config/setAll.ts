import { type ReminderPrefs } from "./types.ts";

export function setAll(_prefs: ReminderPrefs, value: boolean): ReminderPrefs {
    return {
    telegram_24h: value,
    gmail_24h: value,
    telegram_2h: value,
    telegram_30min: value,
    };
}
