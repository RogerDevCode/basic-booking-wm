/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Main webhook handler for Telegram messages (routing + commands)
 * DB Tables Used  : clients (for registration)
 * Concurrency Risk: NO — message routing + single-row registration
 * GCal Calls      : NO
 * Idempotency Key : N/A — message routing is inherently non-idempotent
 * RLS Tenant ID   : NO — clients table is global/shared (no provider_id per §6)
 * Zod Schemas     : YES — robust validation for Telegram updates
 */

/**
 * REASONING TRACE
 * ### Mission Decomposition
 * 1. Parse and validate Telegram update (message or callback_query).
 * 2. Route based on update type (message vs callback_query).
 * 3. Auto-register client in a global context (no provider_id).
 * 4. Dispatch commands using a registry-like pattern for OCP compliance.
 *
 * ### Schema Verification
 * - Table 'clients' confirmed in §6: (client_id, name, email, phone, timezone).
 * - No provider_id means RLS is not applicable here.
 *
 * ### Failure Mode Analysis
 * - Telegram API: Wrapped in Result tuple.
 * - DB: Wrapped in Result tuple, registration failures logged but non-blocking.
 * - Validation: Zod safeParse prevents malformed payload crashes.
 *
 * ### SOLID Architecture Review
 * - SRP: Logic clearly divided into ITelegramClient, IClientRepository, and IRouter.
 * - OCP: The CommandRouter allows adding handlers without modifying core dispatch logic.
 * - LSP: Consistent use of Result<T> for all fallible operations.
 * - ISP: Specialized interfaces for DB, Messaging, and Routing.
 * - DIP: Business logic depends on abstractions, even if implemented locally for Windmill compatibility.
 */

import { TelegramUpdateSchema } from './types';
import { TelegramClient, ClientRepository, TelegramRouter } from './services';
import type { Result } from '../internal/result';

export async function main(rawInput: unknown): Promise<Result<{ readonly message: string }>> {
  const parseResult = TelegramUpdateSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return [new Error(`validation_error: ${parseResult.error.message}`), null];
  }

  const telegramClient = new TelegramClient();
  const clientRepo = new ClientRepository();
  const router = new TelegramRouter(telegramClient, clientRepo);

  const [err, res] = await router.routeUpdate(parseResult.data);

  if (err != null) {
    console.error(`[FATAL_DISPATCH_ERROR] ${err.message}`);
    return [err, null];
  }

  return [null, { message: res ?? 'ok' }];
}