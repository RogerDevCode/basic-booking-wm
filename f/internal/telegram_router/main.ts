/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Deterministic Telegram router with InlineKeyboard callback support
 * DB Tables Used  : None in base route; services/providers/bookings when FSM wizard is active (internal connection)
 * Concurrency Risk: NO — read-only data queries in wizard mode
 * GCal Calls      : NO
 * Idempotency Key : NO — read-only routing
 * RLS Tenant ID   : NO — wizard creates its own connection
 * Zod Schemas     : YES — input validated before use
 */

// ============================================================================
// TELEGRAM ROUTER — Deterministic message routing with InlineKeyboard support
// ============================================================================
// Route priority:
//   1. Callback data — wizard patterns (spec:*, doc:*, time:*, cfm:*) → FSM dispatch
//   2. Callback data — system patterns (cnf:, cxl:, res:, act:, dea:) → legacy
//   3. Slash commands (/start, /admin, /provider) → direct
//   4. Menu text (Agendar cita, 1, 2...) → direct (only if no active wizard)
//   5. Fallback → AI Agent
// ============================================================================

import { z } from 'zod';
import {
  type BookingState,
  type DraftBooking,
  emptyDraft,
  BookingStateSchema,
  buildMainMenuKeyboard,
} from '../booking_fsm';
import { handleBookingWizard } from './booking-wizard';

// ============================================================================
// Types
// ============================================================================

type Result<T> = [Error | null, T | null];

type RouteType = 'callback' | 'command' | 'menu' | 'submenu' | 'wizard' | 'ai_agent';

interface InlineButton {
  readonly text: string;
  readonly callback_data: string;
}

interface RouteResult {
  readonly route: RouteType;
  readonly forward_to_ai: boolean;
  readonly response_text: string;
  readonly inline_keyboard: InlineButton[][];
  readonly callback_action: string | null;
  readonly callback_booking_id: string | null;
  readonly menu_action: string | null;
  readonly nextState: BookingState | null;
  readonly nextDraft: DraftBooking | null;
  readonly nextFlowStep: number;
  readonly should_edit: boolean;
  readonly message_id: number | null;
}

// ============================================================================
// Zod Input Schema
// ============================================================================

const InputSchema = z.object({
  text: z.string().nullable().default(null),
  chat_id: z.string().min(1),
  callback_data: z.string().nullable().default(null),
  callback_query_id: z.string().nullable().default(null),
  username: z.string().nullable().default(null),
  booking_state: z.unknown().nullable().default(null),
  booking_draft: z.unknown().nullable().default(null),
  message_id: z.number().int().nullable().default(null),
});

type RouterInput = z.infer<typeof InputSchema>;

// ============================================================================
// Route matchers
// ============================================================================

const CALLBACK_PREFIXES = ['cnf:', 'cxl:', 'res:', 'act:', 'dea:'] as const;

const COMMANDS: Readonly<Record<string, string>> = {
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

const COMMAND_RESPONSES: Readonly<Record<string, string>> = {
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

// ============================================================================
// Helper: check if callback_data is a wizard pattern
// ============================================================================

function isWizardCallback(data: string | null): boolean {
  if (data === null) return false;
  return /^(spec|doc|time|cfm|menu|back|cancel):/.test(data) || data === 'back' || data === 'cancel';
}

// ============================================================================
// Router logic
// ============================================================================

function buildRouteResult(
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

function matchCallback(data: string | null): RouteResult | null {
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

function matchCommand(text: string | null): RouteResult | null {
  if (text === null) return null;
  const lower = text.trim().toLowerCase();

  const commandKey = COMMANDS[lower];
  if (commandKey !== undefined) {
    // /start or /menu → main menu with inline keyboard
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

function matchMenu(text: string | null): RouteResult | null {
  if (text === null) return null;
  const lower = text.trim().toLowerCase();

  const menuKey = MENU_OPTIONS[lower];
  if (menuKey !== undefined) {
    // menu:book → start wizard, menu:mybookings → my bookings, etc.
    if (menuKey === 'book_appointment') {
      return buildRouteResult('menu', MENU_RESPONSES[menuKey] ?? 'Opción procesada.', {
        menuAction: menuKey,
        // Wizard will be triggered by the next step, no keyboard here
        // The user needs to type or we need a separate flow
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
    // Submenu responses with inline keyboards
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

// ============================================================================
// Main entry point
// ============================================================================

export async function main(rawInput: unknown): Promise<Result<RouteResult>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Invalid input: ${parsed.error.message}`), null];
  }

  const input: RouterInput = parsed.data;
  const { text, callback_data, booking_state, booking_draft, message_id } = input;

  // Parse booking state from raw input
  let parsedState: BookingState | null = null;
  if (booking_state !== null && booking_state !== undefined) {
    const parseResult = BookingStateSchema.safeParse(booking_state);
    if (parseResult.success) parsedState = parseResult.data;
  }
  const parsedDraft: DraftBooking | null = (booking_draft !== null && booking_draft !== undefined && typeof booking_draft === 'object')
    ? booking_draft as DraftBooking
    : null;

  // Priority 1: Callback data — wizard patterns
  if (callback_data !== null && isWizardCallback(callback_data) && parsedState !== null && parsedState.name !== 'idle') {
    const [wizardErr, wizardResult] = await handleBookingWizard({
      text: text ?? '',
      callbackData: callback_data,
      currentState: parsedState,
      draft: parsedDraft ?? emptyDraft(),
    });

    if (wizardErr !== null || wizardResult === null) {
      return [wizardErr ?? new Error('Wizard returned null'), null];
    }

    // If this was a callback_query, we should_edit; otherwise sendMessage
    const shouldEdit = wizardResult.should_edit && message_id !== null;

    return [null, buildRouteResult('wizard', wizardResult.response_text, {
      inlineKeyboard: wizardResult.inline_keyboard as InlineButton[][],
      nextState: wizardResult.nextState,
      nextDraft: wizardResult.nextDraft,
      nextFlowStep: wizardResult.nextFlowStep,
      shouldEdit,
      messageId: message_id,
    })];
  }

  // Priority 1b: Text input when active booking state (text-based wizard fallback)
  if (callback_data === null && parsedState !== null && parsedState.name !== 'idle' && text !== null) {
    const [wizardErr, wizardResult] = await handleBookingWizard({
      text,
      callbackData: null,
      currentState: parsedState,
      draft: parsedDraft ?? emptyDraft(),
    });

    if (wizardErr !== null || wizardResult === null) {
      return [wizardErr ?? new Error('Wizard returned null'), null];
    }

    const shouldEdit = wizardResult.should_edit && message_id !== null;

    return [null, buildRouteResult('wizard', wizardResult.response_text, {
      inlineKeyboard: wizardResult.inline_keyboard as InlineButton[][],
      nextState: wizardResult.nextState,
      nextDraft: wizardResult.nextDraft,
      nextFlowStep: wizardResult.nextFlowStep,
      shouldEdit,
      messageId: message_id,
    })];
  }

  // Priority 2: Callback data — system patterns (cnf:, cxl:, etc.)
  const callbackMatch = matchCallback(callback_data);
  if (callbackMatch !== null) return [null, callbackMatch];

  // Priority 3: Slash commands
  const commandMatch = matchCommand(text);
  if (commandMatch !== null) return [null, commandMatch];

  // Priority 4: Menu & submenu (only if not in active wizard)
  // "1" or "agendar cita" when idle → start wizard with specialties
  if (parsedState === null || parsedState.name === 'idle') {
    const lowerText = text?.trim().toLowerCase();
    if (lowerText === '1' || lowerText === 'agendar cita') {
      // Start wizard — fetch specialties and return inline keyboard
      const [wizardErr, wizardResult] = await handleBookingWizard({
        text: '1',
        callbackData: null,
        currentState: null, // Start from idle
        draft: emptyDraft(),
      });
      if (wizardErr === null && wizardResult !== null) {
        return [null, buildRouteResult('wizard', wizardResult.response_text, {
          inlineKeyboard: wizardResult.inline_keyboard as InlineButton[][],
          nextState: wizardResult.nextState,
          nextDraft: wizardResult.nextDraft,
          nextFlowStep: wizardResult.nextFlowStep,
          shouldEdit: false,
        })];
      }
    }
    // Handle "menu:back" callback → return to main menu
    if (callback_data === 'menu:back') {
      return [null, buildRouteResult('command', COMMAND_RESPONSES['welcome'] ?? 'Comando procesado.', {
        inlineKeyboard: buildMainMenuKeyboard(),
        menuAction: 'welcome',
      })];
    }
    const menuMatch = matchMenu(text);
    if (menuMatch !== null) return [null, menuMatch];
  }

  // Fallback: forward to AI Agent
  return [null, buildRouteResult('ai_agent', '', { forwardToAi: true })];
}
