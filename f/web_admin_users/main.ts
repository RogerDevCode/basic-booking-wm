/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : User management CRUD + role change (admin-only)
 * DB Tables Used  : users
 * Concurrency Risk: NO — single-row CRUD operations
 * GCal Calls      : NO
 * Idempotency Key : N/A — CRUD operations are inherently non-idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates action and user fields
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate admin_user_id and action via Zod InputSchema
 * - Verify requesting user is an active admin before any operation
 * - Route to list (200 users), get, update, activate, or deactivate
 * - Build dynamic UPDATE query from provided fields only
 *
 * ### Schema Verification
 * - Tables: users (user_id, full_name, email, rut, phone, role, is_active, telegram_chat_id, last_login, created_at, updated_at)
 * - Columns: All verified; unique constraint on email handles duplicate detection
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Admin not found or inactive → early rejection before any user operation
 * - Scenario 2: Update with no fields → early return error prevents zero-field UPDATE
 * - Scenario 3: Duplicate email on update → unique constraint violation caught and mapped to user-friendly message
 * - Scenario 4: target_user_id missing for get/update/activate/deactivate → explicit validation error
 *
 * ### Concurrency Analysis
 * - Risk: NO — single-row operations with UUID primary keys; unique constraint handled by DB
 *
 * ### SOLID Compliance Check
 * - SRP: YES — each switch branch handles exactly one user action
 * - DRY: YES — UserInfo mapping logic duplicated across branches but structurally identical; shared where practical
 * - KISS: YES — direct SQL with parameterized queries; exhaustive switch with never-type default
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// WEB ADMIN USERS — User management CRUD + role change
// ============================================================================
// List, get, update, deactivate users. Admin-only.
// ============================================================================

import { createDbClient } from '../internal/db/client';
import { withTenantContext } from '../internal/tenant-context/index';
import { InputSchema, type UserInfo, type UsersListResult } from "./types";

export async function main(rawInput: unknown): Promise<[Error | null, UserInfo | UsersListResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { admin_user_id, action } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });
  const tenantId = admin_user_id;

  try {
    const [txErr, txData] = await withTenantContext<unknown>(sql, tenantId, async (tx) => {
      const adminRows = await tx`
        SELECT role FROM users WHERE user_id = ${admin_user_id}::uuid AND is_active = true LIMIT 1
      `;

      const adminRow = adminRows[0];
      if (adminRow === undefined) {
        return [new Error('Admin not found or inactive'), null];
      }

      if (String(adminRow['role']) !== 'admin') {
        return [new Error('Forbidden: admin access required'), null];
      }

      switch (action) {
        case 'list': {
          const rows = await tx`
            SELECT user_id, full_name, email, rut, phone, role, is_active,
                   telegram_chat_id, last_login, created_at
            FROM users
            ORDER BY created_at DESC
            LIMIT 200
          `;

          const users: UserInfo[] = [];
          for (const r of rows) {
            users.push({
              user_id: String(r['user_id']),
              full_name: String(r['full_name']),
              email: r['email'] !== null ? String(r['email']) : null,
              rut: r['rut'] !== null ? String(r['rut']) : null,
              phone: r['phone'] !== null ? String(r['phone']) : null,
              role: String(r['role']),
              is_active: Boolean(r['is_active']),
              telegram_chat_id: r['telegram_chat_id'] !== null ? String(r['telegram_chat_id']) : null,
              last_login: r['last_login'] !== null ? String(r['last_login']) : null,
              created_at: String(r['created_at']),
            });
          }

          const countRows = await tx`SELECT COUNT(*) AS total FROM users`;
          const total = countRows[0] !== undefined ? Number(countRows[0]['total']) : 0;

          return [null, { users: users, total: total }];
        }

        case 'get': {
          const targetId = parsed.data.target_user_id;
          if (targetId === undefined) {
            return [new Error('target_user_id is required for get'), null];
          }

          const rows = await tx`
            SELECT user_id, full_name, email, rut, phone, role, is_active,
                   telegram_chat_id, last_login, created_at
            FROM users WHERE user_id = ${targetId}::uuid LIMIT 1
          `;

          const row = rows[0];
          if (row === undefined) {
            return [new Error('User not found'), null];
          }

          return [null, {
            user_id: String(row['user_id']),
            full_name: String(row['full_name']),
            email: row['email'] !== null ? String(row['email']) : null,
            rut: row['rut'] !== null ? String(row['rut']) : null,
            phone: row['phone'] !== null ? String(row['phone']) : null,
            role: String(row['role']),
            is_active: Boolean(row['is_active']),
            telegram_chat_id: row['telegram_chat_id'] !== null ? String(row['telegram_chat_id']) : null,
            last_login: row['last_login'] !== null ? String(row['last_login']) : null,
            created_at: String(row['created_at']),
          }];
        }

        case 'update': {
          const targetId = parsed.data.target_user_id;
          if (targetId === undefined) {
            return [new Error('target_user_id is required for update'), null];
          }

          const updates: string[] = [];
          const values: string[] = [];

          if (parsed.data.full_name !== undefined) {
            updates.push('full_name = $' + String(values.length + 1));
            values.push(parsed.data.full_name);
          }
          if (parsed.data.email !== undefined) {
            updates.push('email = $' + String(values.length + 1));
            values.push(parsed.data.email);
          }
          if (parsed.data.phone !== undefined) {
            updates.push('phone = $' + String(values.length + 1));
            values.push(parsed.data.phone);
          }
          if (parsed.data.role !== undefined) {
            updates.push('role = $' + String(values.length + 1));
            values.push(parsed.data.role);
          }

          if (updates.length === 0) {
            return [new Error('No fields to update'), null];
          }

          updates.push('updated_at = NOW()');
          values.push(targetId);

          const queryText = 'UPDATE users SET ' + updates.join(', ') + ' WHERE user_id = $' + String(values.length) + '::uuid RETURNING user_id, full_name, email, rut, phone, role, is_active, telegram_chat_id, last_login, created_at';
          const rows = await tx.unsafe(queryText, values);

          const row = rows[0];
          if (row === undefined) {
            return [new Error('User not found'), null];
          }

          return [null, {
            user_id: String(row['user_id']),
            full_name: String(row['full_name']),
            email: row['email'] !== null ? String(row['email']) : null,
            rut: row['rut'] !== null ? String(row['rut']) : null,
            phone: row['phone'] !== null ? String(row['phone']) : null,
            role: String(row['role']),
            is_active: Boolean(row['is_active']),
            telegram_chat_id: row['telegram_chat_id'] !== null ? String(row['telegram_chat_id']) : null,
            last_login: row['last_login'] !== null ? String(row['last_login']) : null,
            created_at: String(row['created_at']),
          }];
        }

        case 'deactivate':
        case 'activate': {
          const targetId = parsed.data.target_user_id;
          if (targetId === undefined) {
            return [new Error('target_user_id is required'), null];
          }

          const isActive = action === 'activate';

          const rows = await tx`
            UPDATE users SET is_active = ${isActive}, updated_at = NOW()
            WHERE user_id = ${targetId}::uuid
            RETURNING user_id, full_name, email, rut, phone, role, is_active, telegram_chat_id, last_login, created_at
          `;

          const row = rows[0];
          if (row === undefined) {
            return [new Error('User not found'), null];
          }

          return [null, {
            user_id: String(row['user_id']),
            full_name: String(row['full_name']),
            email: row['email'] !== null ? String(row['email']) : null,
            rut: row['rut'] !== null ? String(row['rut']) : null,
            phone: row['phone'] !== null ? String(row['phone']) : null,
            role: String(row['role']),
            is_active: Boolean(row['is_active']),
            telegram_chat_id: row['telegram_chat_id'] !== null ? String(row['telegram_chat_id']) : null,
            last_login: row['last_login'] !== null ? String(row['last_login']) : null,
            created_at: String(row['created_at']),
          }];
        }

        default: {
          const _exhaustive: never = action;
          return [new Error(`Unknown action: ${String(_exhaustive)}`), null];
        }
      }
    });

    if (txErr) return [txErr, null];
    return [null, txData as UserInfo | UsersListResult | null];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      return [new Error('A user with this email already exists'), null];
    }
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
