/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Admin-only user role change (client/provider/admin)
 * DB Tables Used  : users, providers
 * Concurrency Risk: NO — single-row UPDATE + conditional INSERT
 * GCal Calls      : NO
 * Idempotency Key : N/A — role changes are inherently non-idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates user_id and new_role
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate admin_user_id, target_user_id, and new_role via Zod InputSchema
 * - Verify requesting user is an active admin
 * - Look up target user and check if role is actually changing (no-op if same)
 * - UPDATE users.role, then conditionally INSERT into providers if new_role is 'provider'
 *
 * ### Schema Verification
 * - Tables: users (user_id, full_name, role, email, is_active, updated_at), providers (provider_id, name, email, specialty, is_active)
 * - Columns: All verified; provider lookup uses email; provider INSERT uses name, email, specialty default 'Medicina General'
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Admin not found or inactive → early rejection before any changes
 * - Scenario 2: Target user not found → explicit error, no mutation
 * - Scenario 3: Same old/new role → early return with no-op result, no DB write
 * - Scenario 4: Provider already exists by email → skip INSERT, role change still committed
 * - Scenario 5: Provider INSERT fails (duplicate email) → transaction rolls back, role change reverted
 *
 * ### Concurrency Analysis
 * - Risk: NO — single-row UPDATE + conditional INSERT; providers.email UNIQUE constraint prevents duplicates
 *
 * ### SOLID Compliance Check
 * - SRP: YES — single responsibility: change role and ensure provider linkage
 * - DRY: YES — no duplicated logic; inline provider existence check is minimal
 * - KISS: YES — straightforward sequential queries within transaction; no abstraction overhead
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// WEB AUTH CHANGE ROLE — Admin-only: change user role
// ============================================================================
// Allows an admin to change a user's role between client/provider/admin.
// When changing to 'provider', creates a linked providers record if missing.
// Validates admin permissions and role transitions.
// ============================================================================

import { z } from 'zod';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  admin_user_id: z.uuid(),
  target_user_id: z.uuid(),
  new_role: z.enum(['client', 'provider', 'admin']),
});

interface ChangeRoleResult {
  readonly user_id: string;
  readonly full_name: string;
  readonly old_role: string;
  readonly new_role: string;
}

export async function main(rawInput: unknown): Promise<[Error | null, ChangeRoleResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { admin_user_id, target_user_id, new_role } = parsed.data;
  
  // Determine tenantId
  const tenantId = admin_user_id || target_user_id;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
      const adminRows = await tx`
        SELECT role FROM users WHERE user_id = ${admin_user_id}::uuid AND is_active = true LIMIT 1
      `;

      const adminRow = adminRows[0];
      if (adminRow === undefined) {
        return [new Error('Admin not found or inactive'), null];
      }

      if (String(adminRow['role']) !== 'admin') {
        return [new Error('Forbidden: only admins can change user roles'), null];
      }

      const targetRows = await tx`
        SELECT user_id, full_name, role FROM users
        WHERE user_id = ${target_user_id}::uuid
        LIMIT 1
      `;

      const targetRow = targetRows[0];
      if (targetRow === undefined) {
        return [new Error('Target user not found'), null];
      }

      const oldRole = String(targetRow['role']);
      if (oldRole === new_role) {
        return [null, {
          user_id: String(targetRow['user_id']),
          full_name: String(targetRow['full_name']),
          old_role: oldRole,
          new_role: new_role,
        }];
      }

      const updateRows = await tx`
        UPDATE users SET role = ${new_role}, updated_at = NOW()
        WHERE user_id = ${target_user_id}::uuid
        RETURNING user_id, full_name
      `;

      const updatedRow = updateRows[0];
      if (updatedRow === undefined) {
        return [new Error('Failed to update user role'), null];
      }

      if (new_role === 'provider') {
        const providerRows = await tx`
          SELECT provider_id FROM providers
          WHERE email = (SELECT email FROM users WHERE user_id = ${target_user_id}::uuid)
          LIMIT 1
        `;

        if (providerRows[0] === undefined) {
          const userWithEmail = await tx`
            SELECT email, full_name FROM users WHERE user_id = ${target_user_id}::uuid LIMIT 1
          `;
          const uRow = userWithEmail[0];
          if (uRow !== undefined) {
            await tx`
              INSERT INTO providers (name, email, specialty, is_active)
              VALUES (${String(uRow['full_name'])}, ${String(uRow['email'])}, 'Medicina General', true)
            `;
          }
        }
      }

      return [null, {
        user_id: String(updatedRow['user_id']),
        full_name: String(updatedRow['full_name']),
        old_role: oldRole,
        new_role: new_role,
      }];
    });

    if (txErr) {
      return [txErr, null];
    }
    return [null, txData];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
