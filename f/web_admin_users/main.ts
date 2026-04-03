// ============================================================================
// WEB ADMIN USERS — User management CRUD + role change
// ============================================================================
// List, get, update, deactivate users. Admin-only.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  admin_user_id: z.string().uuid(),
  action: z.enum(['list', 'get', 'update', 'deactivate', 'activate']).default('list'),
  target_user_id: z.string().uuid().optional(),
  full_name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  role: z.enum(['patient', 'provider', 'admin']).optional(),
  is_active: z.boolean().optional(),
});

interface UserInfo {
  readonly user_id: string;
  readonly full_name: string;
  readonly email: string | null;
  readonly rut: string | null;
  readonly phone: string | null;
  readonly role: string;
  readonly is_active: boolean;
  readonly telegram_chat_id: string | null;
  readonly last_login: string | null;
  readonly created_at: string;
}

interface UsersListResult {
  readonly users: ReadonlyArray<UserInfo>;
  readonly total: number;
}

export async function main(rawInput: unknown): Promise<[Error | null, UserInfo | UsersListResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (parsed.success === false) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { admin_user_id, action } = parsed.data;

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
      return [new Error('Forbidden: admin access required'), null];
    }

    if (action === 'list') {
      const rows = await sql`
        SELECT user_id, full_name, email, rut, phone, role, is_active,
               telegram_chat_id, last_login, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT 200
      `;

      const users: UserInfo[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r === undefined) continue;
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

      const countRows = await sql`SELECT COUNT(*) AS total FROM users`;
      const total = countRows[0] !== undefined ? Number(countRows[0]['total']) : 0;

      return [null, { users: users, total: total }];
    }

    if (action === 'get') {
      const targetId = parsed.data.target_user_id;
      if (targetId === undefined) {
        return [new Error('target_user_id is required for get'), null];
      }

      const rows = await sql`
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

    if (action === 'update') {
      const targetId = parsed.data.target_user_id;
      if (targetId === undefined) {
        return [new Error('target_user_id is required for update'), null];
      }

      const updates: string[] = [];
      const values: string[] = [];

      if (parsed.data.full_name !== undefined) {
        updates.push('full_name = $' + (values.length + 1));
        values.push(parsed.data.full_name);
      }
      if (parsed.data.email !== undefined) {
        updates.push('email = $' + (values.length + 1));
        values.push(parsed.data.email);
      }
      if (parsed.data.phone !== undefined) {
        updates.push('phone = $' + (values.length + 1));
        values.push(parsed.data.phone);
      }
      if (parsed.data.role !== undefined) {
        updates.push('role = $' + (values.length + 1));
        values.push(parsed.data.role);
      }

      if (updates.length === 0) {
        return [new Error('No fields to update'), null];
      }

      updates.push('updated_at = NOW()');
      values.push(targetId);

      const queryText = 'UPDATE users SET ' + updates.join(', ') + ' WHERE user_id = $' + values.length + '::uuid RETURNING user_id, full_name, email, rut, phone, role, is_active, telegram_chat_id, last_login, created_at';
      const rows = await sql.unsafe(queryText, values);

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

    if (action === 'deactivate' || action === 'activate') {
      const targetId = parsed.data.target_user_id;
      if (targetId === undefined) {
        return [new Error('target_user_id is required'), null];
      }

      const isActive = action === 'activate';

      const rows = await sql`
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

    return [new Error('Unknown action: ' + action), null];
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
