import crypto from 'crypto';
import type postgres from 'postgres';
import type { Result } from '../internal/result';

/**
 * Validates Chilean RUT format and checksum (modulo 11).
 */
export function validateRut(rut: string): Result<void> {
  const clean = rut.replace(/[.]/g, '').replace(/-/g, '').toUpperCase();
  if (clean.length < 2) return [new Error('RUT too short'), null];

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);

  if (!/^\d+$/.test(body)) return [new Error('RUT body must contain only digits'), null];
  if (!/^[\dK]$/.test(dv)) return [new Error('RUT verification digit invalid'), null];

  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    const digit = body[i];
    if (digit === undefined) continue;
    sum += Number.parseInt(digit) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  const expectedDv = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);

  if (dv !== expectedDv) {
    return [new Error('Invalid Chilean RUT verification digit'), null];
  }

  return [null, undefined];
}

/**
 * Hashes password using scrypt (compatible with web_auth_login).
 */
export function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

/**
 * withAdminContext — Executes DB logic with app.admin_override = 'true'.
 * Required for auth entry points where user_id (tenant context) is not yet known.
 */
export async function withAdminContext<T>(
  client: postgres.Sql,
  operation: (tx: postgres.Sql) => Promise<Result<T>>,
): Promise<Result<T>> {
  const reserved = await client.reserve();
  try {
    await reserved`BEGIN`;
    // SET LOCAL: bypasses RLS for the duration of this transaction
    await reserved.unsafe("SELECT set_config('app.admin_override', 'true', true)");
    
    const [err, data] = await operation(reserved);
    
    if (err !== null) {
      await reserved`ROLLBACK`;
      return [err, null];
    }
    
    await reserved`COMMIT`;
    return [null, data];
  } catch (error: unknown) {
    await reserved`ROLLBACK`.catch(() => undefined);
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`admin_transaction_failed: ${msg}`), null];
  } finally {
    reserved.release();
  }
}
