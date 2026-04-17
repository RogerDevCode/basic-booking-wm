import type { OrchestratorBookingIntent } from './types';

const LEGACY_INTENT_MAP: Readonly<Record<string, OrchestratorBookingIntent>> = {
  reagendar: 'reagendar_cita',
  consultar_disponible: 'ver_disponibilidad',
  consultar_disponibilidad: 'ver_disponibilidad',
  ver_mis_citas: 'mis_citas',
};

const AUTHORIZED_INTENTS = [
  'crear_cita',
  'cancelar_cita',
  'reagendar_cita',
  'ver_disponibilidad',
  'mis_citas',
] as const;

export function normalizeIntent(intent: string): OrchestratorBookingIntent | null {
  const mapped = LEGACY_INTENT_MAP[intent];
  if (mapped) return mapped;
  if (AUTHORIZED_INTENTS.includes(intent as OrchestratorBookingIntent)) {
    return intent as OrchestratorBookingIntent;
  }
  return null;
}
