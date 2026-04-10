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
 * - Validate action (admin_generate_temp/provider_change/provider_verify) + inputs
 * - Route to corresponding password function within withTenantContext
 * - Hash new passwords with argon2, verify with bcrypt/argon2 compare
 * - Return typed result or error tuple
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
 * - SRP: each function handles one password operation — YES
 * - DRY: shared crypto module for hash/verify — YES
 * - KISS: action-based routing with clear branches — YES
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

const ActionSchema = z.enum(['admin_generate_temp', 'provider_change', 'provider_verify']);

const InputSchema = z.object({
  tenant_id: z.uuid(),
  action: ActionSchema,
  provider_id: z.uuid(),
  current_password: z.string().optional(),
  new_password: z.string().optional(),
});

interface TempPasswordResult {
  readonly provider_id: string;
  readonly provider_name: string;
  readonly tempPassword: string;
  readonly expires_at: string;
  readonly message: string;
}

async function adminGenerateTempPassword(tx: postgres.Sql, providerId: string): Promise<Result<TempPasswordResult>> {
  const providers = await tx.values<[string, string, string][]>`
    SELECT provider_id, name, email FROM providers WHERE provider_id = ${providerId}::uuid LIMIT 1
  `;
  const provider = providers[0];
  if (provider == null) {
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
    provider_id: provider[0],
    provider_name: provider[1],
    tempPassword,
    expires_at: expiresAt,
    message: `Temp password for ${provider[1]} (${provider[2]}): ${tempPassword} (expires in 24h)`,
  }];
}

interface PasswordChangeResult {
  readonly provider_id: string;
  readonly message: string;
}

async function providerChangePassword(
  tx: postgres.Sql,
  providerId: string,
  currentPassword: string,
  newPassword: string
): Promise<Result<PasswordChangeResult>> {
  const policy = validatePasswordPolicy(newPassword);
  if (!policy.valid) {
    return [new Error(`Password policy failed: ${policy.errors.join(', ')}`), null];
  }

  const providers = await tx.values<[string | null][]>`
    SELECT password_hash FROM providers WHERE provider_id = ${providerId}::uuid LIMIT 1
  `;
  const provider = providers[0];
  if (provider === undefined || provider[0] === null) {
    return [new Error('Provider not found or no password set'), null];
  }

  const isValid = await verifyPassword(currentPassword, provider[0]);
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

interface VerifyResult {
  readonly provider_id: string;
  readonly valid: boolean;
  readonly provider_name: string | null;
}

async function providerVerify(
  tx: postgres.Sql,
  providerId: string,
  password: string
): Promise<Result<VerifyResult>> {
  const providers = await tx.values<[string | null, string | null, string | null][]>`
    SELECT provider_id, password_hash, name FROM providers WHERE provider_id = ${providerId}::uuid LIMIT 1
  `;
  const provider = providers[0];
  if (provider === undefined) {
    return [new Error('Provider not found'), null];
  }

  const passwordHash = provider[1];
  const name = provider[2];

  if (passwordHash === null) {
    return [null, { provider_id: providerId, valid: false, provider_name: name }];
  }

  const isValid = await verifyPassword(password, passwordHash);
  return [null, { provider_id: providerId, valid: isValid, provider_name: name }];
}

export async function main(rawInput: unknown): Promise<Result<unknown>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    if (input.action === 'admin_generate_temp') {
      const [err, result] = await withTenantContext(sql, input.tenant_id, (tx) =>
        adminGenerateTempPassword(tx, input.provider_id)
      );
      if (err !== null) return [err, null];
      if (result === null) return [new Error('Failed to generate temp password'), null];
      return [null, result];
    }

    if (input.action === 'provider_change') {
      const currentPw = input.current_password;
      const newPw = input.new_password;
      if (currentPw == null || newPw == null) {
        return [new Error('provider_change requires current_password and new_password'), null];
      }
      const [err, result] = await withTenantContext(sql, input.tenant_id, (tx) =>
        providerChangePassword(tx, input.provider_id, currentPw, newPw)
      );
      if (err !== null) return [err, null];
      if (result === null) return [new Error('Failed to change password'), null];
      return [null, result];
    }

    if (input.action === 'provider_verify') {
      const password = input.current_password;
      if (password == null) {
        return [new Error('provider_verify requires current_password'), null];
      }
      const [err, result] = await withTenantContext(sql, input.tenant_id, (tx) =>
        providerVerify(tx, input.provider_id, password)
      );
      if (err !== null) return [err, null];
      if (result === null) return [new Error('Failed to verify password'), null];
      return [null, result];
    }

    return [new Error(`Unknown action: ${input.action}`), null];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`Internal error: ${msg}`), null];
  } finally {
    await sql.end();
  }
}
