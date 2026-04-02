// ============================================================================
// TELEGRAM MENU — Main Menu Handler
// ============================================================================
// Displays the main menu with persistent reply keyboard.
// Routes user actions to appropriate sub-scripts (wizard, reminder_config, etc).
// ============================================================================

import { z } from 'zod';

const InputSchema = z.object({
  action: z.enum(['show', 'select_option', 'start']),
  chat_id: z.string(),
  user_input: z.string().optional(),
  patient_id: z.string().optional(),
});

const MAIN_MENU_KEYBOARD: string[][] = [
  ['📅 Agendar cita', '📋 Mis citas'],
  ['🔔 Recordatorios', '❓ Información'],
];

const OPTION_MAP: Record<string, string> = {
  'agendar cita': 'book_appointment',
  'mis citas': 'my_bookings',
  'recordatorios': 'reminders',
  'información': 'info',
  '1': 'book_appointment',
  '2': 'my_bookings',
  '3': 'reminders',
  '4': 'info',
};

function parseUserOption(input: string): string | null {
  const lower = input.toLowerCase().trim();
  for (const [key, value] of Object.entries(OPTION_MAP)) {
    if (lower.includes(key)) return value;
  }
  return null;
}

export function main(rawInput: unknown): { success: boolean; data: Record<string, unknown> | null; error_message: string | null } {
  try {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, data: null, error_message: `Invalid input: ${parsed.error.message}` };
    }

    const { action, chat_id, user_input, patient_id } = parsed.data;

    let message = '';
    let reply_keyboard: string[][] | undefined;
    let inline_buttons: { text: string; callback_data: string }[] | undefined;
    let force_reply = false;
    const reply_placeholder = '';
    let route_to: string | null = null;

    switch (action) {
      case 'show':
      case 'start':
        message = `👋 *¡Bienvenido!*\n\nSoy el asistente de citas médicas.\n\n¿En qué puedo ayudarte hoy?`;
        reply_keyboard = MAIN_MENU_KEYBOARD;
        break;

      case 'select_option': {
        if (!user_input) {
          message = '⚠️ No pude entender tu selección. Por favor toca un botón del menú.';
          reply_keyboard = MAIN_MENU_KEYBOARD;
          break;
        }

        route_to = parseUserOption(user_input);

        if (!route_to) {
          message = `🤔 No reconocí "${user_input}". Elige una opción del menú:`;
          reply_keyboard = MAIN_MENU_KEYBOARD;
          break;
        }

        switch (route_to) {
          case 'book_appointment':
            message = `📅 *Agendar Cita*\n\nIniciemos el proceso de reserva.\n\nPrimero, elige una fecha disponible:`;
            reply_keyboard = undefined;
            force_reply = false;
            break;

          case 'my_bookings':
            message = `📋 *Mis Citas*\n\nAquí puedes ver tus citas próximas.\n\n(Toca el botón para consultar)`;
            inline_buttons = [
              { text: '📅 Ver próximas', callback_data: 'list_bookings' },
              { text: '📜 Historial', callback_data: 'booking_history' },
            ];
            break;

          case 'reminders':
            message = `🔔 *Recordatorios*\n\nConfigura cómo y cuándo recibir avisos de tus citas.`;
            reply_keyboard = [
              ['⚙️ Configurar preferencias', '🔕 Desactivar todo'],
              ['✅ Activar todo', '« Volver al menú'],
            ];
            break;

          case 'info':
            message = `❓ *Información del Consultorio*\n\n💡 *Comandos rápidos:*\n/menu — Menú principal\n/cancelar — Cancelar cita\n/estado — Estado de tu cita`;
            reply_keyboard = MAIN_MENU_KEYBOARD;
            break;
        }
        break;
      }
    }

    return {
      success: true,
      data: {
        message,
        reply_keyboard,
        inline_buttons,
        force_reply,
        reply_placeholder,
        route_to,
        chat_id,
        patient_id,
      },
      error_message: null,
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { success: false, data: null, error_message: error.message };
  }
}
