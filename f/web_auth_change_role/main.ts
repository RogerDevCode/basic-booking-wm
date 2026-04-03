// ============================================================================
// WEB AUTH CHANGE ROLE — Admin-only: change user role
// ============================================================================
// Allows an admin to change a user's role between patient/provider/admin.
// When changing to 'provider', creates a linked providers record if missing.
// Validates admin permissions and role transitions.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  admin_user_id: z.string().uuid(),
  target_user_id: z.string().uuid(),
  new_role: z.enum(['patient', 'provider', 'admin']),
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

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    const adminRows = await sql`
      SELECT role FROM users WHERE user_id = ${admin_user_id}::uuid AND is_active = true LIMIT 1
    `;

    const adminRow = adminRows[0];
    if (adminRow === undefined) {
      return [new Error('Admin not found or inactive'), null];
    }

    if (String(adminRow['role']) !== 'admin') {
      return [new Error('Forbidden: only admins can change user roles'), null];
    }

    const targetRows = await sql`
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

    const updateRows = await sql`
      UPDATE users SET role = ${new_role}, updated_at = NOW()
      WHERE user_id = ${target_user_id}::uuid
      RETURNING user_id, full_name
    `;

    const updatedRow = updateRows[0];
    if (updatedRow === undefined) {
      return [new Error('Failed to update user role'), null];
    }

    if (new_role === 'provider') {
      const providerRows = await sql`
        SELECT provider_id FROM providers
        WHERE email = (SELECT email FROM users WHERE user_id = ${target_user_id}::uuid)
        LIMIT 1
      `;

      if (providerRows[0] === undefined) {
        const userWithEmail = await sql`
          SELECT email, full_name FROM users WHERE user_id = ${target_user_id}::uuid LIMIT 1
        `;
        const uRow = userWithEmail[0];
        if (uRow !== undefined) {
          await sql`
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
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
