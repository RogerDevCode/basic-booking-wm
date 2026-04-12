/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Response templates for each FSM state
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

export function buildSpecialtyPrompt(items: ReadonlyArray<{ id: string; name: string }>, error?: string | null): string {
  const lines = items.map((it, i) => `${i + 1}. ${it.name}`).join('\n');
  const header = error ? `⚠️ ${error}\n\n` : '';
  return `${header}📅 *Pedir hora*\n\nEspecialidades disponibles:\n\n${lines}\n\nEscribe el número de la especialidad que necesitas.`;
}

export function buildDoctorsPrompt(specialtyName: string, items: ReadonlyArray<{ id: string; name: string }>, error?: string | null): string {
  const lines = items.map((it, i) => `${i + 1}. ${it.name}`).join('\n');
  const header = error ? `⚠️ ${error}\n\n` : '';
  const specialty = specialtyName ? ` en *${specialtyName}*` : '';
  return `${header}👨‍⚕️ *Doctores disponibles*${specialty}\n\n${lines}\n\nEscribe el número del doctor que prefieres.`;
}

export function buildSlotsPrompt(doctorName: string, items: ReadonlyArray<{ id: string; label: string; start_time: string }>, error?: string | null): string {
  const lines = items.map((it, i) => `${i + 1}. ${it.label}`).join('\n');
  const header = error ? `⚠️ ${error}\n\n` : '';
  return `${header}🕐 *Horarios disponibles*\n\nDoctor: *${doctorName}*\n\n${lines}\n\nEscribe el número del horario que prefieres.`;
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
