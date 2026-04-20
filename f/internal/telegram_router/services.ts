import { buildMainMenuKeyboard } from '../booking_fsm/index';
import type { BookingState, DraftBooking } from '../booking_fsm/index';
import type { RouteResult, RouteType, InlineButton } from './types';

const CALLBACK_PREFIXES = ['cnf:', 'cxl:', 'res:', 'act:', 'dea:'] as const;

export const COMMANDS: Readonly<Record<string, string>> = {
  '/start': 'welcome',
  '/admin': 'admin_panel',
  '/provider': 'provider_panel',
} as const;

const MENU_OPTIONS: Readonly<Record<string, string>> = {
  'agendar cita': 'book_appointment',
  'mis citas': 'my_bookings',
  'recordatorios': 'reminders',
  'informacion': 'info',
  '1': 'book_appointment',
  '2': 'my_bookings',
  '3': 'reminders',
  '4': 'info',
} as const;

const SUBMENU_OPTIONS: Readonly<Record<string, string>> = {
  'configurar preferencias': 'reminder_prefs',
  'desactivar todo': 'reminder_deactivate_all',
  'activar todo': 'reminder_activate_all',
  'volver al menu': 'back_to_main',
  'ver proximas': 'upcoming_bookings',
  'historial': 'booking_history',
  'volver': 'back_to_main',
} as const;

const CALLBACK_RESPONSES: Readonly<Record<string, string>> = {
  'cnf': '✅ Cita confirmada correctamente.',
  'cxl': '❌ Cita cancelada correctamente.',
  'res': '📅 Para reagendar, indícame la nueva fecha y hora que prefieres.',
  'act': '🔔 Recordatorios activados correctamente.',
  'dea': '🔕 Recordatorios desactivados correctamente.',
} as const;

export const COMMAND_RESPONSES: Readonly<Record<string, string>> = {
  'welcome': '¡Bienvenido al sistema de citas médicas!\n\n¿En qué puedo ayudarte?\n\n1️⃣ Agendar cita\n2️⃣ Mis citas\n3️⃣ Recordatorios\n4️⃣ Información',
  'admin_panel': '🔧 Panel de administración.\n\nSeleccione una opción:\n• Crear provider\n• Especialidades\n• Estadísticas',
  'provider_panel': '👨‍⚕️ Panel del proveedor.\n\nSeleccione una opción:\n• Mi agenda\n• Notas clínicas\n• Confirmar citas\n• Mi perfil',
} as const;

const MENU_RESPONSES: Readonly<Record<string, string>> = {
  'book_appointment': '📅 *Agendar Cita*\n\nPor favor, indícame la fecha y hora que necesitas para tu cita.\nPuedes decirme algo como: "Mañana a las 10 de la mañana"',
  'my_bookings': '📋 *Mis Citas*\n\nAquí puedes ver tus citas programadas.\n¿Qué deseas consultar?\n\n• Ver próximas\n• Historial',
  'reminders': '🔔 *Recordatorios*\n\n¿Qué deseas hacer?\n\n• Configurar preferencias\n• Activar todo\n• Desactivar todo\n• Volver al menú',
  'info': 'ℹ️ *Información*\n\nHorario de atención: Lunes a Viernes 8:00 - 18:00\nSábados: 8:00 - 12:00\n\n¿En qué puedo ayudarte?',
} as const;

const SUBMENU_RESPONSES: Readonly<Record<string, string>> = {
  'reminder_prefs': '⚙️ *Configurar Recordatorios*\n\n¿Con cuánta anticipación deseas recibir recordatorios?\n\n• 24 horas\n• 2 horas\n• 30 minutos',
  'reminder_deactivate_all': '🔕 Todos los recordatorios han sido desactivados.',
  'reminder_activate_all': '🔔 Todos los recordatorios han sido activados (24h, 2h, 30min).',
  'back_to_main': '📱 *Menú Principal*\n\n1️⃣ Agendar cita\n2️⃣ Mis citas\n3️⃣ Recordatorios\n4️⃣ Información',
  'upcoming_bookings': '📅 *Próximas Citas*\n\nNo tienes citas programadas. ¿Deseas agendar una?',
  'booking_history': '📋 *Historial de Citas*\n\nNo se encontraron citas en tu historial.',
} as const;

export function isWizardCallback(data: string | null): boolean {
  if (data === null) return false;
  return /^(spec|doc|time|cfm|menu|back|cancel):/.test(data) || data === 'back' || data === 'cancel';
}

export function buildRouteResult(
  route: RouteType,
  responseText: string,
  opts: {
    forwardToAi?: boolean;
    inlineKeyboard?: InlineButton[][];
    callbackAction?: string | null;
    callbackBookingId?: string | null;
    menuAction?: string | null;
    nextState?: BookingState | null;
    nextDraft?: DraftBooking | null;
    nextFlowStep?: number;
    shouldEdit?: boolean;
    messageId?: number | null;
  } = {},
): RouteResult {
  return {
    route,
    forward_to_ai: opts.forwardToAi ?? false,
    response_text: responseText,
    inline_keyboard: opts.inlineKeyboard ?? [],
    callback_action: opts.callbackAction ?? null,
    callback_booking_id: opts.callbackBookingId ?? null,
    menu_action: opts.menuAction ?? null,
    nextState: opts.nextState ?? null,
    nextDraft: opts.nextDraft ?? null,
    nextFlowStep: opts.nextFlowStep ?? 0,
    should_edit: opts.shouldEdit ?? false,
    message_id: opts.messageId ?? null,
  };
}

export function matchCallback(data: string | null): RouteResult | null {
  if (data === null) return null;

  for (const prefix of CALLBACK_PREFIXES) {
    if (data.startsWith(prefix)) {
      const action = prefix.slice(0, -1);
      const bookingId = data.slice(prefix.length) || null;
      const response = CALLBACK_RESPONSES[action] ?? 'Acción procesada.';
      return buildRouteResult('callback', response, {
        callbackAction: action,
        callbackBookingId: bookingId,
      });
    }
  }
  return null;
}

export function matchCommand(text: string | null): RouteResult | null {
  if (text === null) return null;
  const lower = text.trim().toLowerCase();

  const commandKey = COMMANDS[lower];
  if (commandKey !== undefined) {
    if (commandKey === 'welcome') {
      return buildRouteResult('command', COMMAND_RESPONSES[commandKey] ?? 'Comando procesado.', {
        menuAction: commandKey,
        inlineKeyboard: buildMainMenuKeyboard(),
      });
    }
    return buildRouteResult('command', COMMAND_RESPONSES[commandKey] ?? 'Comando procesado.', {
      menuAction: commandKey,
    });
  }
  return null;
}

export function matchMenu(text: string | null): RouteResult | null {
  if (text === null) return null;
  const lower = text.trim().toLowerCase();

  const menuKey = MENU_OPTIONS[lower];
  if (menuKey !== undefined) {
    if (menuKey === 'book_appointment') {
      return buildRouteResult('menu', MENU_RESPONSES[menuKey] ?? 'Opción procesada.', {
        menuAction: menuKey,
      });
    }
    if (menuKey === 'my_bookings') {
      return buildRouteResult('menu', MENU_RESPONSES[menuKey] ?? 'Opción procesada.', {
        menuAction: menuKey,
        inlineKeyboard: [
          [{ text: '📅 Ver próximas', callback_data: 'menu:upcoming' }, { text: '📋 Historial', callback_data: 'menu:history' }],
          [{ text: '« Volver al menú', callback_data: 'menu:back' }],
        ],
      });
    }
    if (menuKey === 'reminders') {
      return buildRouteResult('menu', MENU_RESPONSES[menuKey] ?? 'Opción procesada.', {
        menuAction: menuKey,
        inlineKeyboard: [
          [{ text: '⚙️ Configurar', callback_data: 'menu:reminder_prefs' }, { text: '✅ Activar todo', callback_data: 'menu:reminder_on' }],
          [{ text: '🔕 Desactivar todo', callback_data: 'menu:reminder_off' }, { text: '« Volver', callback_data: 'menu:back' }],
        ],
      });
    }
    if (menuKey === 'info') {
      return buildRouteResult('menu', MENU_RESPONSES[menuKey] ?? 'Opción procesada.', {
        menuAction: menuKey,
        inlineKeyboard: [
          [{ text: '📅 Agendar cita', callback_data: 'menu:book' }],
          [{ text: '« Volver al menú', callback_data: 'menu:back' }],
        ],
      });
    }
    return buildRouteResult('menu', MENU_RESPONSES[menuKey] ?? 'Opción procesada.', {
      menuAction: menuKey,
    });
  }

  const subKey = SUBMENU_OPTIONS[lower];
  if (subKey !== undefined) {
    if (subKey === 'back_to_main') {
      return buildRouteResult('submenu', SUBMENU_RESPONSES[subKey] ?? 'Opción procesada.', {
        menuAction: subKey,
        inlineKeyboard: buildMainMenuKeyboard(),
      });
    }
    if (subKey === 'reminder_prefs') {
      return buildRouteResult('submenu', SUBMENU_RESPONSES[subKey] ?? 'Opción procesada.', {
        menuAction: subKey,
        inlineKeyboard: [
          [{ text: '⏰ 24 horas', callback_data: 'menu:pref24h' }, { text: '⏰ 2 horas', callback_data: 'menu:pref2h' }],
          [{ text: '⏰ 30 minutos', callback_data: 'menu:pref30m' }, { text: '« Volver', callback_data: 'menu:back' }],
        ],
      });
    }
    if (subKey === 'reminder_deactivate_all') {
      return buildRouteResult('submenu', SUBMENU_RESPONSES[subKey] ?? 'Opción procesada.', {
        menuAction: subKey,
        inlineKeyboard: [
          [{ text: '✅ Activar recordatorios', callback_data: 'menu:reminder_on' }],
          [{ text: '« Volver al menú', callback_data: 'menu:back' }],
        ],
      });
    }
    if (subKey === 'reminder_activate_all') {
      return buildRouteResult('submenu', SUBMENU_RESPONSES[subKey] ?? 'Opción procesada.', {
        menuAction: subKey,
        inlineKeyboard: [
          [{ text: '🔕 Desactivar todo', callback_data: 'menu:reminder_off' }],
          [{ text: '« Volver al menú', callback_data: 'menu:back' }],
        ],
      });
    }
    if (subKey === 'upcoming_bookings') {
      return buildRouteResult('submenu', SUBMENU_RESPONSES[subKey] ?? 'Opción procesada.', {
        menuAction: subKey,
        inlineKeyboard: [
          [{ text: '📋 Historial', callback_data: 'menu:history' }],
          [{ text: '« Volver', callback_data: 'menu:back' }],
        ],
      });
    }
    if (subKey === 'booking_history') {
      return buildRouteResult('submenu', SUBMENU_RESPONSES[subKey] ?? 'Opción procesada.', {
        menuAction: subKey,
        inlineKeyboard: [
          [{ text: '📅 Ver próximas', callback_data: 'menu:upcoming' }],
          [{ text: '« Volver al menú', callback_data: 'menu:back' }],
        ],
      });
    }
    return buildRouteResult('submenu', SUBMENU_RESPONSES[subKey] ?? 'Opción procesada.', {
      menuAction: subKey,
    });
  }

  return null;
}
