/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Complete profile for Telegram-registered user via web
 * DB Tables Used  : users
 * Concurrency Risk: NO — single-row UPDATE protected by admin transaction
 * GCal Calls      : NO
 * Idempotency Key : N/A — profile completion is inherently non-idempotent
 * RLS Tenant ID   : YES — withAdminContext (app.admin_override) used for lookup/update
 * Zod Schemas     : YES — InputSchema validates RUT, email, password strength
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate input via Zod (email, RUT, password match)
 * - Use shared validatePasswordPolicy from f/internal/crypto
 * - Use withAdminContext (admin_override) to find user by chat_id and update profile
 * - Perform global uniqueness check for email/RUT before update
 * - Maintain scrypt hashing for compatibility with web_auth_login
 *
 * ### Schema Verification
 * - Tables: users (user_id, full_name, telegram_chat_id, rut, email, address, phone, password_hash, timezone, role, updated_at)
 * - Columns: Verified against migrations/014_create_missing_tables.sql
 *
 * ### Failure Mode Analysis
 * - Scenario 1: User not found → generic error "No Telegram user found"
 * - Scenario 2: Duplicate email/RUT → uniqueness check prevents conflict, returns clear error
 * - Scenario 3: Password policy violation → validatePasswordPolicy provides detailed feedback
 * - Scenario 4: DB transaction failure → caught and returned as Result<Error>
 *
 * ### Concurrency Analysis
 * - Risk: NO — transaction with admin_override ensures isolation for lookup-and-update
 *
 * ### SOLID Compliance Check
 * - SRP: YES — separated validation, hashing, and database orchestration
 * - DRY: YES — uses shared internal helpers for config, db, result, and crypto
 * - KISS: YES — linear pipeline: parse -> validate -> execute_transaction
 * - DIP: YES — depends on createDbClient and shared Result type
 *
 * → CLEARED FOR CODE GENERATION
 */

import { z } from 'zod';
import crypto from 'crypto';
import type postgres from 'postgres';
import { DEFAULT_TIMEZONE } from '../internal/config';
import { createDbClient } from '../internal/db/client';
import { validatePasswordPolicy } from '../internal/crypto';
import type { Result } from '../internal/result';

// ============================================================================
// WEB AUTH COMPLETE PROFILE — Complete profile for Telegram user
// ============================================================================
// Allows a Telegram-registered user to complete their profile via web.
// Sets RUT, email, address, phone, and password for the first time.
// Uses admin_override to bypass RLS for initial user discovery by chat_id.
// ============================================================================

const InputSchema = z.object({
  chat_id: z.string().min(1),
  rut: z.string().min(1).max(12),
  email: z.email(),
  address: z.string().min(1).max(300),
  phone: z.string().min(1).max(50),
  password: z.string().min(8).max(128),
  password_confirm: z.string().min(8).max(128),
  timezone: z.string().default(DEFAULT_TIMEZONE),
});

interface CompleteProfileResult {
  readonly user_id: string;
  readonly full_name: string;
  readonly email: string;
  readonly rut: string;
  readonly role: string;
}

interface UserRow {
  readonly user_id: string;
  readonly full_name: string;
  readonly email: string | null;
  readonly rut: string | null;
  readonly role: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Validates Chilean RUT format and checksum (modulo 11).
 */
function validateRut(rut: string): Result<void> {
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
function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

/**
 * withAdminContext — Executes DB logic with app.admin_override = 'true'.
 * Required for auth entry points where user_id (tenant context) is not yet known.
 */
async function withAdminContext<T>(
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
    await reserved`ROLLBACK`.catch(() => {});
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`admin_transaction_failed: ${msg}`), null];
  } finally {
    reserved.release();
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

export async function main(rawInput: unknown): Promise<Result<CompleteProfileResult>> {
  // 1. Parse Input
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { chat_id, rut, email, address, phone, password, password_confirm, timezone } = parsed.data;

  // 2. Business Validation
  if (password !== password_confirm) {
    return [new Error('Passwords do not match'), null];
  }

  const policy = validatePasswordPolicy(password);
  if (!policy.valid) {
    return [new Error(`Password policy violation: ${policy.errors.join(', ')}`), null];
  }

  const [rutErr] = validateRut(rut);
  if (rutErr !== null) return [rutErr, null];

  // 3. Setup Infrastructure
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];

  const sql = createDbClient({ url: dbUrl });
  const passwordHash = hashPasswordScrypt(password);

  try {
    // 4. Orchestrate DB Transaction with Admin Override
    return await withAdminContext(sql, async (tx) => {
      // Find the user by Telegram ID
      const userRows = await tx<UserRow[]>`
        SELECT user_id, full_name, email, rut, role 
        FROM users 
        WHERE telegram_chat_id = ${chat_id} 
        LIMIT 1
      `;

      const user = userRows[0];
      if (!user) {
        return [new Error('No Telegram user found. Please interact with the bot first.'), null];
      }

      // Check global uniqueness (since RLS is bypassed via admin_override)
      const existingRows = await tx`
        SELECT user_id FROM users
        WHERE (email = ${email} OR rut = ${rut})
          AND user_id != ${user.user_id}::uuid
        LIMIT 1
      `;

      if (existingRows[0] !== undefined) {
        return [new Error('This email or RUT is already in use by another account'), null];
      }

      // Perform the update
      const updateRows = await tx<CompleteProfileResult[]>`
        UPDATE users SET
          rut = ${rut},
          email = ${email},
          address = ${address},
          phone = ${phone},
          password_hash = ${passwordHash},
          timezone = ${timezone},
          updated_at = NOW()
        WHERE user_id = ${user.user_id}::uuid
        RETURNING user_id, full_name, email, rut, role
      `;

      const result = updateRows[0];
      if (!result) {
        return [new Error('Failed to update profile'), null];
      }

      return [null, result];
    });

  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      return [new Error('This email or RUT is already in use by another account'), null];
    }
    return [new Error('Internal error during profile completion: ' + message), null];
  } finally {
    await sql.end();
  }
}
