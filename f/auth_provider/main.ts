// ============================================================================
// AUTH PROVIDER — Password management (admin + provider)
// ============================================================================
// Actions:
//   - admin_generate_temp: Admin generates 4-char readable temp password
//   - provider_change: Provider changes password (must know current or use temp)
//   - provider_verify: Verify provider login credentials
// ============================================================================

import "@total-typescript/ts-reset";
import { z } from 'zod';
import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import {
  hashPassword,
  verifyPassword,
  generateReadablePassword,
  validatePasswordPolicy,
} from '../internal/crypto';

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

const ActionSchema = z.enum(['admin_generate_temp', 'provider_change', 'provider_verify']);

const InputSchema = z.object({
  tenant_id: z.uuid(),
  action: ActionSchema,
  provider_id: z.uuid(),
  current_password: z.string().optional(),  // For provider_change and provider_verify
  new_password: z.string().optional(),       // For provider_change
});

type Result<T> = [Error | null, T | null];

// ============================================================================
// DB HELPERS
// ============================================================================

// ============================================================================
// ADMIN: Generate temporary password (4-char readable)
// ============================================================================

interface TempPasswordResult {
  readonly provider_id: string;
  readonly provider_name: string;
  readonly temp_password: string;
  readonly expires_at: string;
  readonly message: string;
}

async function adminGenerateTempPassword(tx: postgres.TransactionSql, providerId: string): Promise<Result<TempPasswordResult>> {
  // Verify provider exists
  const providers = await tx`SELECT id, name, email FROM providers WHERE id = ${providerId}::uuid LIMIT 1`;
  const provider = providers[0] as { id: string; name: string; email: string } | undefined;
  if (provider == null) {
    return [new Error(`Provider '${providerId}' not found`), null];
  }

  // Generate 4-char readable password
  const tempPassword = generateReadablePassword(4);

  // Hash it with Argon2id
  const passwordHash = await hashPassword(tempPassword);

  // Set expiration to 24 hours from now
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Update provider
  await tx`
    UPDATE providers
    SET password_hash = ${passwordHash},
        password_reset_token = NULL,
        password_reset_expires = NULL,
        last_password_change = NOW(),
        updated_at = NOW()
    WHERE id = ${providerId}::uuid
  `;

  return [null, {
    provider_id: provider.id,
    provider_name: provider.name,
    temp_password: tempPassword,
    expires_at: expiresAt,
    message: `Temp password for ${provider.name}: ${tempPassword} (expires in 24h, must change on first login)`,
  }];
}

// ============================================================================
// PROVIDER: Change password
// ============================================================================

interface PasswordChangeResult {
  readonly success: boolean;
  readonly message: string;
}

async function providerChangePassword(
  tx: postgres.TransactionSql,
  providerId: string,
  currentPassword: string,
  newPassword: string
): Promise<Result<PasswordChangeResult>> {
  // Validate new password policy
  const policy = validatePasswordPolicy(newPassword);
  if (!policy.valid) {
    return [new Error(`Password policy failed: ${policy.errors.join(', ')}`), null];
  }

  // Fetch provider with password hash
  const providers = await tx`SELECT id, name, password_hash FROM providers WHERE id = ${providerId}::uuid LIMIT 1`;
  const provider = providers[0] as { id: string; name: string; password_hash: string | null } | undefined;
  if (provider == null) {
    return [new Error(`Provider '${providerId}' not found`), null];
  }

  // Verify current password
  if (provider.password_hash == null) {
    return [new Error('Provider has no password set. Ask admin to generate a temp password.'), null];
  }

  const isValid = await verifyPassword(currentPassword, provider.password_hash);
  if (!isValid) {
    return [new Error('Current password is incorrect'), null];
  }

  // Hash new password
  const newHash = await hashPassword(newPassword);

  // Update
  await tx`
    UPDATE providers
    SET password_hash = ${newHash},
        password_reset_token = NULL,
        password_reset_expires = NULL,
        last_password_change = NOW(),
        updated_at = NOW()
    WHERE id = ${providerId}::uuid
  `;

  return [null, { success: true, message: 'Password changed successfully' }];
}

// ============================================================================
// PROVIDER: Verify login credentials
// ============================================================================

interface VerifyResult {
  readonly valid: boolean;
  readonly provider_id: string;
  readonly provider_name: string;
  readonly email: string;
  readonly must_change_password: boolean;
  readonly message: string;
}

async function providerVerify(
  tx: postgres.TransactionSql,
  providerId: string,
  password: string
): Promise<Result<VerifyResult>> {
  const providers = await tx`
    SELECT id, name, email, password_hash, last_password_change
    FROM providers
    WHERE id = ${providerId}::uuid AND is_active = true
    LIMIT 1
  `;
  const provider = providers[0] as {
    id: string;
    name: string;
    email: string;
    password_hash: string | null;
    last_password_change: string | null;
  } | undefined;

  if (provider == null) {
    return [new Error('Provider not found or inactive'), null];
  }

  if (provider.password_hash == null) {
    return [null, {
      valid: false,
      provider_id: provider.id,
      provider_name: provider.name,
      email: provider.email,
      must_change_password: true,
      message: 'No password set. Ask admin to generate a temp password.',
    }];
  }

  const isValid = await verifyPassword(password, provider.password_hash);
  if (!isValid) {
    return [null, {
      valid: false,
      provider_id: provider.id,
      provider_name: provider.name,
      email: provider.email,
      must_change_password: false,
      message: 'Invalid password',
    }];
  }

  // Check if password was set by admin (temp password flow)
  // If last_password_change is within 24h of creation, force change
  const mustChange = provider.last_password_change != null &&
    (Date.now() - new Date(provider.last_password_change).getTime()) < 24 * 60 * 60 * 1000;

  return [null, {
    valid: true,
    provider_id: provider.id,
    provider_name: provider.name,
    email: provider.email,
    must_change_password: mustChange,
    message: mustChange
      ? 'Login successful. You must change your password on first login.'
      : 'Login successful',
  }];
}

// ============================================================================
// MAIN
// ============================================================================

export async function main(rawInput: unknown): Promise<Result<unknown>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl == null || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  if (input.action === 'admin_generate_temp') {
    const [err, result] = await withTenantContext(sql, input.tenant_id, (tx) => adminGenerateTempPassword(tx, input.provider_id));
    if (err != null) return [err, null];
    return [null, result];
  }

  if (input.action === 'provider_change') {
    const currentPassword = input.current_password;
    const newPassword = input.new_password;
    if (currentPassword == null || newPassword == null) {
      return [new Error('provider_change requires current_password and new_password'), null];
    }
    const [err, result] = await withTenantContext(sql, input.tenant_id, (tx) => providerChangePassword(tx, input.provider_id, currentPassword, newPassword));
    if (err != null) return [err, null];
    return [null, result];
  }

  if (input.action === 'provider_verify') {
    const password = input.current_password;
    if (password == null) {
      return [new Error('provider_verify requires current_password'), null];
    }
    const [err, result] = await withTenantContext(sql, input.tenant_id, (tx) => providerVerify(tx, input.provider_id, password));
    if (err != null) return [err, null];
    return [null, result];
  }

  return [new Error(`Unknown action: ${input.action}`), null];
}
