import type { Input } from './types.ts';

export const MAIN_MENU_KEYBOARD: string[][] = [
  ['📅 Agendar cita', '📋 Mis citas'],
  ['🔔 Recordatorios', '❓ Información'],
];

export const OPTION_MAP: Record<string, string> = {
  'agendar cita': 'book_appointment',
  'mis citas': 'my_bookings',
  'recordatorios': 'reminders',
  'información': 'info',
  '1': 'book_appointment',
  '2': 'my_bookings',
  '3': 'reminders',
  '4': 'info',
};

export function parseUserOption(input: string): string | null {
  const lower = input.toLowerCase().trim();
  for (const [key, value] of Object.entries(OPTION_MAP)) {
    if (lower.includes(key)) return value;
  }
  return null;
}

export function buildMainMenu(data: { chat_id: string; client_id?: string }) {
  return {
    text: '🏥 *Menú Principal*\n\nSelecciona una opción:',
    reply_markup: {
      keyboard: MAIN_MENU_KEYBOARD,
      resize_keyboard: true,
      one_time_keyboard: false,
    },
    parse_mode: 'Markdown',
    chat_id: data.chat_id,
  };
}

export function handleShowMenu(input: Input) {
  const menuParams: { chat_id: string; client_id?: string } = { chat_id: input.chat_id };
  if (input.client_id) {
    menuParams.client_id = input.client_id;
  }
  const result = buildMainMenu(menuParams);
  return {
    success: true,
    data: result,
    error_message: null,
  };
}

export function handleSelectOption(input: Input) {
  const userInput = input.user_input ?? '';
  const action = parseUserOption(userInput);
  
  if (!action) {
    const menuParams: { chat_id: string; client_id?: string } = { chat_id: input.chat_id };
    if (input.client_id) {
      menuParams.client_id = input.client_id;
    }
    const menuResult = buildMainMenu(menuParams);
    return {
      success: false,
      data: { ...menuResult, text: '⚠️ Opción no reconocida. Por favor selecciona una opción válida.' },
      error_message: 'Invalid option selected',
    };
  }

  return {
    success: true,
    data: { action, chat_id: input.chat_id, client_id: input.client_id },
    error_message: null,
  };
}