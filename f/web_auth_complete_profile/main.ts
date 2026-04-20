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

import { createDbClient } from '../internal/db/client';
import { validatePasswordPolicy } from '../internal/crypto/index';
import type { Result } from '../internal/result/index';
import { InputSchema, type CompleteProfileResult, type UserRow } from './types';
import { validateRut, hashPasswordScrypt, withAdminContext } from './services';

// ============================================================================
// WEB AUTH COMPLETE PROFILE — Complete profile for Telegram user
// ============================================================================
// Allows a Telegram-registered user to complete their profile via web.
// Sets RUT, email, address, phone, and password for the first time.
// Uses admin_override to bypass RLS for initial user discovery by chat_id.
// ============================================================================

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
