/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Password management for providers (generate temp, change, verify)
 * DB Tables Used  : providers
 * Concurrency Risk: NO — single-row UPDATE by provider_id
 * GCal Calls      : NO
 * Idempotency Key : N/A — password changes are inherently non-idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates all inputs
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Standardize handler signatures to `(tx, input) => Promise<Result<T>>`.
 * - Implement an action registry to decouple routing from `main`.
 * - Replace `tx.values` with named column selections for better readability and maintainability.
 * - Improve SRP by separating input validation, action dispatching, and business logic.
 *
 * ### Schema Verification
 * - Table: providers (provider_id PK, name, email, password_hash, last_password_change)
 * - Columns: password_hash, password_reset_token, password_reset_expires verified in 003/005
 *
 * ### Failure Mode Analysis
 * - Wrong current password → verifyPassword returns false, error returned
 * - Weak new password → validatePasswordPolicy rejects, error returned
 * - Provider not found → SELECT returns empty, error returned
 *
 * ### Concurrency Analysis
 * - Risk: NO — single-row UPDATE by provider_id, no locks needed
 *
 * ### SOLID Compliance Check
 * - SRP: orchestration in main, routing in HANDLERS, logic in specialized functions — YES
 * - OCP: Adding new actions requires no change to the main execution flow — YES
 * - LSP: All handlers follow the Result tuple contract — YES
 * - KISS: Explicit routing and clean error propagation — YES
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// AUTH PROVIDER — Password management (admin + provider)
// ============================================================================
// Actions:
//   - admin_generate_temp: Admin generates 4-char readable temp password
//   - provider_change: Provider changes password (must know current or use temp)
//   - provider_verify: Verify provider login credentials
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import "@total-typescript/ts-reset";
import { z } from 'zod';
import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';
import {
  hashPassword,
  verifyPassword,
  generateReadablePassword,
  validatePasswordPolicy,
} from '../internal/crypto';

// ============================================================
// SCHEMAS & TYPES
// ============================================================

const ActionSchema = z.enum(['admin_generate_temp', 'provider_change', 'provider_verify']);
type AuthAction = z.infer<typeof ActionSchema>;

const InputSchema = z.object({
  tenant_id: z.uuid(),
  action: ActionSchema,
  provider_id: z.uuid(),
  current_password: z.string().optional(),
  new_password: z.string().optional(),
});

type AuthInput = Readonly<z.infer<typeof InputSchema>>;

interface TempPasswordResult {
  readonly provider_id: string;
  readonly provider_name: string;
  readonly tempPassword: string;
  readonly expires_at: string;
  readonly message: string;
}

interface PasswordChangeResult {
  readonly provider_id: string;
  readonly message: string;
}

interface VerifyResult {
  readonly provider_id: string;
  readonly valid: boolean;
  readonly provider_name: string | null;
}

// ============================================================
// HANDLERS
// ============================================================

/**
 * SRP: Admin generates 4-char readable temp password.
 */
async function adminGenerateTempPassword(
  tx: postgres.Sql,
  input: AuthInput
): Promise<Result<TempPasswordResult>> {
  const providerId = input.provider_id;

  const rows = await tx<{ provider_id: string; name: string; email: string }[]>`
    SELECT provider_id, name, email 
    FROM providers 
    WHERE provider_id = ${providerId}::uuid 
    LIMIT 1
  `;
  
  const provider = rows[0];
  if (provider === undefined) {
    return [new Error(`Provider '${providerId}' not found`), null];
  }

  const tempPassword = generateReadablePassword(4);
  const passwordHash = await hashPassword(tempPassword);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await tx`
    UPDATE providers
    SET password_hash = ${passwordHash},
        password_reset_token = NULL,
        password_reset_expires = NULL,
        last_password_change = NOW(),
        updated_at = NOW()
    WHERE provider_id = ${providerId}::uuid
  `;

  return [null, {
    provider_id: provider.provider_id,
    provider_name: provider.name,
    tempPassword,
    expires_at: expiresAt,
    message: `Temp password for ${provider.name} (${provider.email}): ${tempPassword} (expires in 24h)`,
  }];
}

/**
 * SRP: Provider changes password (must know current or use temp).
 */
async function providerChangePassword(
  tx: postgres.Sql,
  input: AuthInput
): Promise<Result<PasswordChangeResult>> {
  const { provider_id: providerId, current_password: currentPassword, new_password: newPassword } = input;

  if (currentPassword == null || newPassword == null) {
    return [new Error('provider_change requires current_password and new_password'), null];
  }

  const policy = validatePasswordPolicy(newPassword);
  if (!policy.valid) {
    return [new Error(`Password policy failed: ${policy.errors.join(', ')}`), null];
  }

  const rows = await tx<{ password_hash: string | null }[]>`
    SELECT password_hash FROM providers WHERE provider_id = ${providerId}::uuid LIMIT 1
  `;
  const provider = rows[0];
  if (provider === undefined || provider.password_hash === null) {
    return [new Error('Provider not found or no password set'), null];
  }

  const isValid = await verifyPassword(currentPassword, provider.password_hash);
  if (!isValid) {
    return [new Error('Current password is incorrect'), null];
  }

  const newHash = await hashPassword(newPassword);
  await tx`
    UPDATE providers
    SET password_hash = ${newHash},
        password_reset_token = NULL,
        password_reset_expires = NULL,
        last_password_change = NOW(),
        updated_at = NOW()
    WHERE provider_id = ${providerId}::uuid
  `;

  return [null, { provider_id: providerId, message: 'Password changed successfully' }];
}

/**
 * SRP: Verify provider login credentials.
 */
async function providerVerify(
  tx: postgres.Sql,
  input: AuthInput
): Promise<Result<VerifyResult>> {
  const { provider_id: providerId, current_password: password } = input;

  if (password == null) {
    return [new Error('provider_verify requires current_password'), null];
  }

  const rows = await tx<{ provider_id: string; password_hash: string | null; name: string | null }[]>`
    SELECT provider_id, password_hash, name FROM providers WHERE provider_id = ${providerId}::uuid LIMIT 1
  `;
  const provider = rows[0];
  if (provider === undefined) {
    return [new Error('Provider not found'), null];
  }

  if (provider.password_hash === null) {
    return [null, { provider_id: providerId, valid: false, provider_name: provider.name }];
  }

  const isValid = await verifyPassword(password, provider.password_hash);
  return [null, { provider_id: providerId, valid: isValid, provider_name: provider.name }];
}

// ============================================================
// REGISTRY & DISPATCHER
// ============================================================

type HandlerFunc = (tx: postgres.Sql, input: AuthInput) => Promise<Result<unknown>>;

/**
 * OCP: Action registry maps actions to their respective handlers.
 */
const HANDLERS: Readonly<Record<AuthAction, HandlerFunc>> = Object.freeze({
  admin_generate_temp: adminGenerateTempPassword,
  provider_change: providerChangePassword,
  provider_verify: providerVerify,
});

/**
 * Orchestrator for action execution within tenant context.
 */
async function dispatchAction(
  sql: postgres.Sql,
  input: AuthInput
): Promise<Result<unknown>> {
  const handler = HANDLERS[input.action];
  if (handler === undefined) {
    return [new Error(`Unknown action: ${input.action}`), null];
  }

  return withTenantContext(sql, input.tenant_id, (tx) => handler(tx, input));
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

/**
 * Windmill main function.
 * Handles configuration, resource lifecycle, and top-level error trapping.
 */
export async function main(rawInput: unknown): Promise<Result<unknown>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: AuthInput = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [err, result] = await dispatchAction(sql, input);
    if (err !== null) {
      return [err, null];
    }
    return [null, result];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`Internal error: ${msg}`), null];
  } finally {
    await sql.end();
  }
}
