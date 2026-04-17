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
import { InputSchema, WizardStateSchema, type Input, type StepView, type WizardState } from './types';
import { WizardRepository } from './WizardRepository';
import { WizardRouter } from './WizardRouter';
import { StartHandler } from './handlers/StartHandler';
import { SelectDateHandler } from './handlers/SelectDateHandler';
import { SelectTimeHandler } from './handlers/SelectTimeHandler';
import { ConfirmHandler } from './handlers/ConfirmHandler';
import { BackHandler } from './handlers/BackHandler';
import { CancelHandler } from './handlers/CancelHandler';

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
    const router = new WizardRouter();
    router.register('start', new StartHandler());
    router.register('select_date', new SelectDateHandler());
    router.register('select_time', new SelectTimeHandler());
    router.register('confirm', new ConfirmHandler());
    router.register('back', new BackHandler());
    router.register('cancel', new CancelHandler());

    const [err, routeView] = await router.route(input.action, {
      input,
      state,
      repo,
      serviceDurationMin
    });

    if (err) {
      return [err, null];
    }
    if (!routeView) {
      return [new Error('no_view_returned'), null];
    }
    view = routeView;
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