/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Deterministic Telegram router — match menu/callback/command, fallback to AI Agent
 * DB Tables Used  : None in base route; services/providers/bookings when FSM wizard is active
 * Concurrency Risk: NO — read-only data queries in wizard mode
 * GCal Calls      : NO
 * Idempotency Key : NO — read-only routing
 * RLS Tenant ID   : YES — wizard mode requires SQL client in tenant context
 * Zod Schemas     : YES — input validated before use
 */

// ============================================================================
// TELEGRAM ROUTER — Deterministic message routing
// ============================================================================

import type postgres from 'postgres';
import { z } from 'zod';
import {
  type BookingState,
  type DraftBooking,
  emptyDraft,

} from '../booking_fsm';
import { handleBookingWizard } from './booking-wizard';

// ============================================================================
// Types
// ============================================================================

type Result<T> = [Error | null, T | null];

type RouteType = 'callback' | 'command' | 'menu' | 'submenu' | 'wizard' | 'ai_agent';

interface RouteResult {
  readonly route: RouteType;
  readonly forward_to_ai: boolean;
  readonly response_text: string;
  readonly callback_action: string | null;
  readonly callback_booking_id: string | null;
  readonly menu_action: string | null;
  readonly nextState: BookingState | null;
  readonly nextDraft: DraftBooking | null;
  readonly nextFlowStep: number;
}

// ============================================================================
// Zod Input Schema
// ============================================================================

const InputSchema = z.object({
  text: z.string().nullable().default(null),
  chat_id: z.string().min(1),
  callback_data: z.string().nullable().default(null),
  username: z.string().nullable().default(null),
});

type RouterInput = z.infer<typeof InputSchema>;

interface RouterStateInput {
  readonly bookingState: BookingState | null;
  readonly bookingDraft: DraftBooking | null;
  readonly sql: postgres.Sql | null;
}

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
// Router logic
// ============================================================================

function matchCallback(data: string | null): Pick<RouteResult, 'route' | 'forward_to_ai' | 'response_text' | 'callback_action' | 'callback_booking_id' | 'menu_action' | 'nextState' | 'nextDraft' | 'nextFlowStep'> | null {
  if (data === null) return null;

  for (const prefix of CALLBACK_PREFIXES) {
    if (data.startsWith(prefix)) {
      const action = prefix.slice(0, -1);
      const bookingId = data.slice(prefix.length) || null;
      const response = CALLBACK_RESPONSES[action] ?? 'Acción procesada.';
      return {
        route: 'callback' as const,
        forward_to_ai: false,
        response_text: response,
        callback_action: action,
        callback_booking_id: bookingId,
        menu_action: null,
        nextState: null,
        nextDraft: null,
        nextFlowStep: 0,
      };
    }
  }
  return null;
}

function matchCommand(text: string | null): Pick<RouteResult, 'route' | 'forward_to_ai' | 'response_text' | 'callback_action' | 'callback_booking_id' | 'menu_action' | 'nextState' | 'nextDraft' | 'nextFlowStep'> | null {
  if (text === null) return null;
  const lower = text.trim().toLowerCase();

  const commandKey = COMMANDS[lower];
  if (commandKey !== undefined) {
    return {
      route: 'command' as const,
      forward_to_ai: false,
      response_text: COMMAND_RESPONSES[commandKey] ?? 'Comando procesado.',
      callback_action: null,
      callback_booking_id: null,
      menu_action: commandKey,
      nextState: null,
      nextDraft: null,
      nextFlowStep: 0,
    };
  }
  return null;
}

function matchMenu(text: string | null): Pick<RouteResult, 'route' | 'forward_to_ai' | 'response_text' | 'callback_action' | 'callback_booking_id' | 'menu_action' | 'nextState' | 'nextDraft' | 'nextFlowStep'> | null {
  if (text === null) return null;
  const lower = text.trim().toLowerCase();

  const menuKey = MENU_OPTIONS[lower];
  if (menuKey !== undefined) {
    return {
      route: 'menu' as const,
      forward_to_ai: false,
      response_text: MENU_RESPONSES[menuKey] ?? 'Opción procesada.',
      callback_action: null,
      callback_booking_id: null,
      menu_action: menuKey,
      nextState: null,
      nextDraft: null,
      nextFlowStep: 0,
    };
  }

  const subKey = SUBMENU_OPTIONS[lower];
  if (subKey !== undefined) {
    return {
      route: 'submenu' as const,
      forward_to_ai: false,
      response_text: SUBMENU_RESPONSES[subKey] ?? 'Opción procesada.',
      callback_action: null,
      callback_booking_id: null,
      menu_action: subKey,
      nextState: null,
      nextDraft: null,
      nextFlowStep: 0,
    };
  }

  return null;
}

// ============================================================================
// Main entry point — simple (no state)
// ============================================================================

export async function main(rawInput: unknown): Promise<Result<RouteResult>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Invalid input: ${parsed.error.message}`), null];
  }

  const input: RouterInput = parsed.data;

  const callbackMatch = matchCallback(input.callback_data);
  if (callbackMatch !== null) return [null, callbackMatch];

  const commandMatch = matchCommand(input.text);
  if (commandMatch !== null) return [null, commandMatch];

  const menuMatch = matchMenu(input.text);
  if (menuMatch !== null) return [null, menuMatch];

  return [null, {
    route: 'ai_agent',
    forward_to_ai: true,
    response_text: '',
    callback_action: null,
    callback_booking_id: null,
    menu_action: null,
    nextState: null,
    nextDraft: null,
    nextFlowStep: 0,
  }];
}

// ============================================================================
// Main entry point — with conversation state (FSM wizard support)
// ============================================================================

export async function mainWithState(
  rawInput: unknown,
  stateInput: RouterStateInput,
): Promise<Result<RouteResult>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Invalid input: ${parsed.error.message}`), null];
  }

  const input: RouterInput = parsed.data;
  const { bookingState, bookingDraft, sql } = stateInput;

  // Priority 1: Callback data (always direct)
  const callbackMatch = matchCallback(input.callback_data);
  if (callbackMatch !== null) return [null, callbackMatch];

  // Priority 2: Slash commands (always direct, even in wizard)
  const commandMatch = matchCommand(input.text);
  if (commandMatch !== null) return [null, commandMatch];

  // Priority 3: If in booking wizard, delegate to FSM
  if (bookingState !== null && bookingState.name !== 'idle' && sql !== null) {
    const [wizardErr, wizardResult] = await handleBookingWizard({
      text: input.text ?? '',
      currentState: bookingState,
      draft: bookingDraft ?? emptyDraft(),
      sql,
    });

    if (wizardErr !== null || wizardResult === null) {
      return [wizardErr ?? new Error('Wizard returned null'), null];
    }

    return [null, {
      route: 'wizard',
      forward_to_ai: false,
      response_text: wizardResult.response_text,
      callback_action: null,
      callback_booking_id: null,
      menu_action: null,
      nextState: wizardResult.nextState,
      nextDraft: wizardResult.nextDraft,
      nextFlowStep: wizardResult.nextFlowStep,
    }];
  }

  // Priority 4: Menu & submenu options (only if not in wizard)
  const menuMatch = matchMenu(input.text);
  if (menuMatch !== null) return [null, menuMatch];

  // Fallback: forward to AI Agent
  return [null, {
    route: 'ai_agent',
    forward_to_ai: true,
    response_text: '',
    callback_action: null,
    callback_booking_id: null,
    menu_action: null,
    nextState: null,
    nextDraft: null,
    nextFlowStep: 0,
  }];
}
