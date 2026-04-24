//nobundling
/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Admin-only user role change
 * DB Tables Used  : users, providers
 * Concurrency Risk: NO — single-row UPDATE
 * GCal Calls      : NO
 * Idempotency Key : N/A
 * RLS Tenant ID   : YES
 * Zod Schemas     : YES
 */

import { withTenantContext } from '../internal/tenant-context/index.ts';
import { createDbClient } from '../internal/db/client.ts';
import type { Result } from '../internal/result/index.ts';
import { InputSchema, type Input, type ChangeRoleResult } from './types.ts';

export async function main(args: any) : Promise<Result<ChangeRoleResult>> {
const rawInput: unknown = args;
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const input: Input = parsed.data;
  const tenantId = input.admin_user_id || input.target_user_id;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
      const adminRows = await tx.values<[string]>`
        SELECT role FROM users WHERE user_id = ${input.admin_user_id}::uuid AND is_active = true LIMIT 1
      `;

      const adminRow = adminRows[0];
      if (!adminRow) {
        return [new Error('Admin not found or inactive'), null];
      }

      const adminRole = adminRow[0];
      if (adminRole !== 'admin') {
        return [new Error('Forbidden: only admins can change user roles'), null];
      }

      const targetRows = await tx.values<[string, string, string]>`
        SELECT user_id, full_name, role FROM users
        WHERE user_id = ${input.target_user_id}::uuid
        LIMIT 1
      `;

      const targetRow = targetRows[0];
      if (!targetRow) {
        return [new Error('Target user not found'), null];
      }

      const [targetUserId, targetFullName, oldRole] = targetRow;
      if (targetUserId === undefined || targetFullName === undefined || oldRole === undefined) {
        return [new Error('Target user row missing required data'), null];
      }

      if (oldRole === input.new_role) {
        return [null, {
          user_id: targetUserId,
          full_name: targetFullName,
          old_role: oldRole,
          new_role: input.new_role,
        }];
      }

      const updateRows = await tx.values<[string, string]>`
        UPDATE users SET role = ${input.new_role}, updated_at = NOW()
        WHERE user_id = ${input.target_user_id}::uuid
        RETURNING user_id, full_name
      `;

      const updatedRow = updateRows[0];
      if (updatedRow === undefined) {
        return [new Error('Failed to update user role'), null];
      }

      const updatedUserId = updatedRow[0];
      const updatedFullName = updatedRow[1];
      if (updatedUserId === undefined || updatedFullName === undefined) {
        return [new Error('Failed to update user role'), null];
      }

      return [null, {
        user_id: updatedUserId,
        full_name: updatedFullName,
        old_role: oldRole,
        new_role: input.new_role,
      }];
    });

    if (txErr) return [txErr, null];
    return [null, txData];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}