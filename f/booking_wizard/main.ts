/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Multi-step appointment booking flow (availability → confirmation → creation)
 * DB Tables Used  : bookings, providers, clients, services, provider_schedules
 * Concurrency Risk: YES — booking creation uses transaction with GIST constraint
 * GCal Calls      : NO — gcal_sync handles async sync after creation
 * Idempotency Key : YES — ON CONFLICT (idempotency_key) DO NOTHING
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — WizardStateSchema + InputSchema
 */

/**
 * REASONING TRACE
 * ### Mission Decomposition
 * - [x] Validate input (action, wizard_state, user_input, provider/service IDs)
 * - [x] Orchestrate multi-step booking flow (0->1->2->3->99)
 * - [x] Separate concerns: Orchestration (Handlers), Data Access (Repository), UI (UIBuilder)
 * - [x] Enforce mandatory RLS via withTenantContext
 * - [x] Use Result<T> tuple pattern throughout per AGENTS.md §4
 * - [x] Use Spanish vocabulary for booking statuses per GEMINI.md §5.2
 *
 * ### Schema Verification
 * - Tables: providers, services, bookings, booking_audit verified against §6.
 * - Columns: verified status ('pendiente', 'confirmada', 'cancelada', 'reagendada').
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Missing DB URL -> return error tuple.
 * - Scenario 2: Service/Provider not found -> return error tuple within withTenantContext.
 * - Scenario 3: Overlapping booking -> gist constraint throws, withTenantContext handles rollback.
 *
 * ### Concurrency Analysis
 * - Risk: YES (double booking).
 * - Lock strategy: withTenantContext + SELECT FOR UPDATE on provider's schedule (if needed) + GIST constraint.
 *
 * ### SOLID Compliance Check
 * - SRP: WizardRepository handles DB, WizardUI handles text/buttons, main handles routing.
 * - OCP: Action handlers can be extended easily.
 * - KISS: Simple state machine transitions.
 * - DIP: DB client injected into repository methods.
 *
 * → CLEARED FOR CODE GENERATION
 */

import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';
import { InputSchema, WizardStateSchema, type Input, type WizardState, type StepView } from './types';
import { DateUtils, WizardUI, WizardRepository } from './services';

export async function main(rawInput: unknown): Promise<Result<Record<string, unknown>>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`invalid_input: ${parsed.error.message}`), null];
  }

  const input: Input = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined) {
    return [new Error('configuration_error: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  const tenantId = input.provider_id ?? (typeof input.wizard_state?.['client_id'] === 'string' ? input.wizard_state['client_id'] : null);
  if (tenantId === null) {
    await sql.end();
    return [new Error('authentication_error: tenant_id_required'), null];
  }

  const repo = new WizardRepository(sql, tenantId);

  let state: WizardState;
  const stateResult = WizardStateSchema.safeParse(input.wizard_state);
  if (stateResult.success) {
    state = stateResult.data;
  } else {
    state = {
      step: 0,
      client_id: typeof input.wizard_state?.['client_id'] === 'string' ? input.wizard_state['client_id'] : '',
      chat_id: typeof input.wizard_state?.['chat_id'] === 'string' ? input.wizard_state['chat_id'] : '',
      selected_date: null,
      selected_time: null,
    };
  }

  const [svcErr, duration] = input.service_id !== undefined
    ? await repo.getServiceDuration(input.service_id)
    : [null, 30];

  if (svcErr !== null) {
    await sql.end();
    return [svcErr, null];
  }
  const serviceDurationMin = duration ?? 30;

  let view: StepView;

  try {
    switch (input.action) {
      case 'start':
        view = WizardUI.buildDateSelection(state, 0);
        break;

      case 'select_date': {
        const dateStr = input.user_input !== undefined ? DateUtils.parseDate(input.user_input) : null;
        const finalDate = dateStr ?? state.selected_date;

        if (finalDate === null) {
          view = WizardUI.buildDateSelection(state, 0);
        } else {
          const [err, slots] = input.provider_id !== undefined
            ? await repo.getAvailableSlots(input.provider_id, finalDate, serviceDurationMin)
            : [null, DateUtils.generateTimeSlots(8, 18, serviceDurationMin)];

          if (err !== null || slots === null || slots.length === 0) {
            const msg = slots?.length === 0 ? `😅 No hay horarios para el ${DateUtils.format(finalDate, input.timezone)}.` : 'Error al buscar disponibilidad.';
            const baseView = WizardUI.buildDateSelection({ ...state, selected_date: null }, 0);
            view = { ...baseView, message: `${msg}\n\n${baseView.message}` };
          } else {
            view = WizardUI.buildTimeSelection({ ...state, selected_date: finalDate }, slots, input.timezone);
          }
        }
        break;
      }

      case 'select_time': {
        const timeStr = input.user_input !== undefined ? DateUtils.parseTime(input.user_input) : null;
        const finalTime = timeStr ?? input.user_input?.trim() ?? state.selected_time;

        if (finalTime === null) {
          view = {
            message: '⚠️ Por favor selecciona un horario o escribe la hora (ej: 10:00).',
            reply_keyboard: [['« Volver a fechas', '❌ Cancelar']],
            new_state: state,
            force_reply: true,
            reply_placeholder: 'Escribe la hora (ej: 10:00)',
          };
        } else if (input.provider_id === undefined || input.service_id === undefined) {
          view = {
            message: '⚠️ Faltan datos del profesional o servicio.',
            reply_keyboard: [['❌ Cancelar']],
            new_state: state,
          };
        } else {
          const [err, names] = await repo.getProviderAndServiceNames(input.provider_id, input.service_id);
          if (err !== null || names === null) {
            view = {
              message: '⚠️ No se pudo recuperar la información necesaria. Reintenta.',
              reply_keyboard: [['« Volver a fechas', '❌ Cancelar']],
              new_state: state,
            };
          } else {
            view = WizardUI.buildConfirmation({ ...state, selected_time: finalTime }, names.provider, names.service, input.timezone);
          }
        }
        break;
      }

      case 'confirm': {
        if (state.selected_date === null || state.selected_time === null || input.provider_id === undefined || input.service_id === undefined) {
          const baseView = WizardUI.buildDateSelection({ ...state, selected_date: null, selected_time: null }, 0);
          view = { ...baseView, message: `⚠️ Faltan datos críticos.\n\n${baseView.message}` };
        } else {
          const [err, bookingId] = await repo.createBooking(state.client_id, input.provider_id, input.service_id, state.selected_date, state.selected_time, input.timezone, serviceDurationMin);
          if (err !== null) {
            view = {
              message: `❌ Error al agendar: ${err.message}. Intenta con otro horario.`,
              reply_keyboard: [['📅 Agendar otra', '📋 Mis citas']],
              new_state: { ...state, step: 0, selected_date: null, selected_time: null },
            };
          } else {
            const [_namesErr, names] = await repo.getProviderAndServiceNames(input.provider_id, input.service_id);
            const providerName = names?.provider ?? 'Profesional';
            const serviceName = names?.service ?? 'Servicio';

            view = {
              message: `🎉 *¡Cita Agendada!*\n\n🆔 ID: \`${bookingId ?? ''}\`\n📅 Fecha: ${DateUtils.format(state.selected_date, input.timezone)}\n🕐 Hora: ${state.selected_time}\n👨‍⚕️ Profesional: ${providerName}\n📋 Servicio: ${serviceName}\n\nTu cita ha sido registrada exitosamente.`,
              reply_keyboard: [['📅 Agendar otra', '📋 Mis citas']],
              new_state: { ...state, step: 99 },
            };
          }
        }
        break;
      }

      case 'back':
        if (state.step <= 1) {
          view = {
            message: '📋 Menú principal.',
            reply_keyboard: [['📅 Agendar cita', '📋 Mis citas']],
            new_state: { ...state, step: 0 },
          };
        } else if (state.step === 2) {
          view = WizardUI.buildDateSelection({ ...state, selected_date: null }, 0);
        } else if (state.step === 3) {
          const [_err, slots] = (input.provider_id !== undefined && state.selected_date !== null)
            ? await repo.getAvailableSlots(input.provider_id, state.selected_date, serviceDurationMin)
            : [null, DateUtils.generateTimeSlots(8, 18, serviceDurationMin)];
          view = WizardUI.buildTimeSelection({ ...state, selected_time: null }, slots ?? [], input.timezone);
        } else {
          view = WizardUI.buildDateSelection({ ...state, selected_date: null, selected_time: null }, 0);
        }
        break;

      case 'cancel':
        view = {
          message: '❌ Cancelado.',
          reply_keyboard: [['📅 Agendar cita', '📋 Mis citas']],
          new_state: { ...state, step: 0, selected_date: null, selected_time: null },
        };
        break;
    }
  } finally {
    await sql.end();
  }

  return [null, {
    message: view.message,
    reply_keyboard: view.reply_keyboard,
    force_reply: view.force_reply ?? false,
    reply_placeholder: view.reply_placeholder ?? '',
    wizard_state: view.new_state,
    is_complete: view.new_state.step === 99,
  }];
}