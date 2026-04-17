/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Response templates for each FSM state (Refactored)
 * DB Tables Used  : None — pure string templates
 * Concurrency Risk: NO
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : N/A
 */

// ============================================================================
// BOOKING FSM — Response Templates
// ============================================================================
// Deterministic response generators for each wizard step.
// No LLM involved. All strings are pre-defined and predictable.
// ============================================================================

/**
 * Internal helpers for formatting consistency (DRY)
 */
const fmt = {
  header: (error?: string | null): string => (error ? `⚠️ ${error}\n\n` : ''),
  listItem: (index: number, text: string): string => `${(index + 1).toString()}. ${text}`,
  list: (items: readonly { name?: string; label?: string }[]): string =>
    items.map((it, i) => fmt.listItem(i, it.name ?? it.label ?? '')).join('\n'),
};

export function buildSpecialtyPrompt(
  items: readonly { readonly id: string; readonly name: string }[],
  error?: string | null
): string {
  const header = fmt.header(error);
  const list = fmt.list(items);
  return `${header}📅 *Pedir hora*\n\nEspecialidades disponibles:\n\n${list}\n\nEscribe el número de la especialidad que necesitas.`;
}

export function buildDoctorsPrompt(
  specialtyName: string,
  items: readonly { readonly id: string; readonly name: string }[],
  error?: string | null
): string {
  const header = fmt.header(error);
  const list = fmt.list(items);
  const specialty = specialtyName ? ` en *${specialtyName}*` : '';
  return `${header}👨‍⚕️ *Doctores disponibles*${specialty}\n\n${list}\n\nEscribe el número del doctor que prefieres.`;
}

export function buildSlotsPrompt(
  doctorName: string,
  items: readonly { readonly id: string; readonly label: string; readonly start_time: string }[],
  error?: string | null
): string {
  const header = fmt.header(error);
  const list = fmt.list(items);
  return `${header}🕐 *Horarios disponibles*\n\nDoctor: *${doctorName}*\n\n${list}\n\nEscribe el número del horario que prefieres.`;
}

export function buildConfirmationPrompt(timeLabel: string, doctorName: string, extra?: string): string {
  const prompt = extra ?? '¿Confirmas esta cita? Responde "sí" o "no".';
  return `📋 *Confirmar Cita*\n\nDoctor: ${doctorName}\nHorario: ${timeLabel}\n\n${prompt}`;
}

export function buildLoadingDoctorsPrompt(specialtyName: string): string {
  return `⏳ Buscando doctores disponibles en *${specialtyName}*...`;
}

export function buildLoadingSlotsPrompt(doctorName: string): string {
  return `⏳ Buscando horarios disponibles con *${doctorName}*...`;
}

export function buildNoSpecialtiesAvailable(): string {
  return 'No hay especialidades disponibles en este momento. Intenta más tarde.';
}

export function buildNoDoctorsAvailable(specialtyName: string): string {
  return `No hay doctores disponibles en *${specialtyName}* en este momento.`;
}

export function buildNoSlotsAvailable(doctorName: string): string {
  return `No hay horarios disponibles con *${doctorName}*. ¿Deseas elegir otro doctor?`;
}

// ============================================================================
// INLINE KEYBOARD BUILDERS — callback_data ≤ 64 bytes each
// ============================================================================

interface InlineButton {
  readonly text: string;
  readonly callback_data: string;
}

const buttons = {
  make: (text: string, data: string): InlineButton => Object.freeze({ text, callback_data: data }),
  cancel: (): InlineButton => buttons.make('❌ Cancelar', 'cancel'),
  back: (): InlineButton => buttons.make('⬅️ Volver', 'back'),
};

export function buildSpecialtyKeyboard(
  items: readonly { readonly id: string; readonly name: string }[]
): InlineButton[][] {
  const list = items.map((it, i) => buttons.make(it.name, `spec:${(i + 1).toString()}`));
  return chunkButtons([...list, buttons.cancel()]);
}

export function buildDoctorKeyboard(
  items: readonly { readonly id: string; readonly name: string }[]
): InlineButton[][] {
  const list = items.map((it, i) => buttons.make(it.name, `doc:${(i + 1).toString()}`));
  return chunkButtons([...list, buttons.back(), buttons.cancel()]);
}

export function buildTimeSlotKeyboard(
  items: readonly { readonly id: string; readonly label: string; readonly start_time: string }[]
): InlineButton[][] {
  const list = items.map((it, i) => buttons.make(it.label, `time:${(i + 1).toString()}`));
  return chunkButtons([...list, buttons.back(), buttons.cancel()]);
}

export function buildConfirmationKeyboard(): InlineButton[][] {
  return [
    [buttons.make('✅ Sí, confirmar', 'cfm:yes'), buttons.make('❌ No, volver', 'cfm:no')],
  ];
}

export function buildMainMenuKeyboard(): InlineButton[][] {
  return [
    [buttons.make('📅 Agendar cita', 'menu:book')],
    [buttons.make('📋 Mis citas', 'menu:mybookings'), buttons.make('🔔 Recordatorios', 'menu:reminders')],
    [buttons.make('ℹ️ Información', 'menu:info')],
  ];
}

/**
 * Standard grid layout for Telegram keyboards
 */
function chunkButtons(btns: readonly InlineButton[], size = 2): InlineButton[][] {
  if (btns.length === 0) return [];
  const rows: InlineButton[][] = [];
  for (let i = 0; i < btns.length; i += size) {
    rows.push([...btns.slice(i, i + size)]);
  }
  return rows;
}
