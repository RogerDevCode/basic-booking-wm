// ============================================================================
// WEB AUTH COMPLETE PROFILE — Complete profile for Telegram user
// ============================================================================
// Allows a Telegram-registered user to complete their profile via web.
// Sets RUT, email, address, phone, and password for the first time.
// Validates Chilean RUT (módulo 11), email uniqueness, password strength.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import crypto from 'crypto';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  chat_id: z.string().min(1),
  rut: z.string().min(1).max(12),
  email: z.email(),
  address: z.string().min(1).max(300),
  phone: z.string().min(1).max(50),
  password: z.string().min(8).max(128),
  password_confirm: z.string().min(8).max(128),
  timezone: z.string().default('America/Santiago'),
});

interface CompleteProfileResult {
  readonly user_id: string;
  readonly full_name: string;
  readonly email: string;
  readonly rut: string;
  readonly role: string;
}

function validateRut(rut: string): boolean {
  const clean = rut.replace(/[.]/g, '').replace(/-/g, '').toUpperCase();
  if (clean.length < 2) return false;

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);

  if (!/^\d+$/.test(body)) return false;
  if (!/^[\dK]$/.test(dv)) return false;

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

  return dv === expectedDv;
}

function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character';
  return null;
}

function hashPasswordSync(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

export async function main(rawInput: unknown): Promise<[Error | null, CompleteProfileResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { chat_id, rut, email, address, phone, password, password_confirm, timezone } = parsed.data;

  if (password !== password_confirm) {
    return [new Error('Passwords do not match'), null];
  }

  const passwordError = validatePasswordStrength(password);
  if (passwordError !== null) {
    return [new Error(passwordError), null];
  }

  if (!validateRut(rut)) {
    return [new Error('Invalid Chilean RUT format or verification digit'), null];
  }

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const passwordHash = hashPasswordSync(password);

  const sql = createDbClient({ url: dbUrl });
  const tenantId = '00000000-0000-0000-0000-000000000000';

  try {
    const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
      const userRows = await tx`
        SELECT user_id, full_name, telegram_chat_id FROM users
        WHERE telegram_chat_id = ${chat_id}
        LIMIT 1
      `;

      const userRow = userRows[0];
      if (userRow === undefined) {
        return [new Error('No Telegram user found. Please interact with the bot first.'), null];
      }

      const existingRows = await tx`
        SELECT user_id FROM users
        WHERE (email = ${email} OR rut = ${rut})
          AND telegram_chat_id != ${chat_id}
        LIMIT 1
      `;

      const existingRow = existingRows[0];
      if (existingRow !== undefined) {
        return [new Error('This email or RUT is already in use by another account'), null];
      }

      const updateRows = await tx`
        UPDATE users SET
          rut = ${rut},
          email = ${email},
          address = ${address},
          phone = ${phone},
          password_hash = ${passwordHash},
          timezone = ${timezone},
          updated_at = NOW()
        WHERE telegram_chat_id = ${chat_id}
        RETURNING user_id, full_name, email, rut, role
      `;

      const updatedRow = updateRows[0];
      if (updatedRow === undefined) {
        return [new Error('Failed to update profile'), null];
      }

      return [null, {
        user_id: String(updatedRow['user_id']),
        full_name: String(updatedRow['full_name']),
        email: String(updatedRow['email']),
        rut: String(updatedRow['rut']),
        role: String(updatedRow['role']),
      }];
    });

    if (txErr !== null) {
      throw txErr;
    }

    return [null, txData];

  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    let errorMsg = message;
    if (message.startsWith('transaction_failed: ')) {
      errorMsg = message.substring(20);
    }
    if (errorMsg.includes('duplicate key') || errorMsg.includes('unique constraint')) {
      return [new Error('This email or RUT is already in use by another account'), null];
    }
    return [new Error('Internal error: ' + errorMsg), null];
  } finally {
    await sql.end();
  }
}
