import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context/index.ts';
import type { Result } from '../internal/result/index.ts';
import {
  hashPassword,
  verifyPassword,
  generateReadablePassword,
  validatePasswordPolicy,
} from '../internal/crypto/index.ts';
import type {
  AuthInput,
  TempPasswordResult,
  PasswordChangeResult,
  VerifyResult,
  AuthAction
} from './types.ts';

// ============================================================
// HANDLERS
// ============================================================

/**
 * SRP: Admin generates 4-char readable temp password.
 */
export async function adminGenerateTempPassword(
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
export async function providerChangePassword(
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
  if (provider?.password_hash == null) {
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
export async function providerVerify(
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

export type HandlerFunc = (tx: postgres.Sql, input: AuthInput) => Promise<Result<unknown>>;

/**
 * OCP: Action registry maps actions to their respective handlers.
 */
export const HANDLERS: Readonly<Record<AuthAction, HandlerFunc>> = Object.freeze({
  admin_generate_temp: adminGenerateTempPassword,
  provider_change: providerChangePassword,
  provider_verify: providerVerify,
});

/**
 * Orchestrator for action execution within tenant context.
 */
export async function dispatchAction(
  sql: postgres.Sql,
  input: AuthInput
): Promise<Result<unknown>> {
  const handler = HANDLERS[input.action];
  if (handler === undefined) {
    return [new Error(`Unknown action: ${input.action}`), null];
  }

  return withTenantContext(sql, input.tenant_id, (tx) => handler(tx, input));
}
