// ============================================================================
// WEB WAITLIST — Waitlist CRUD (join, leave, list, position)
// ============================================================================
// Manages client waitlist entries for services.
// Actions: join, leave, list, check_position
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  action: z.enum(['join', 'leave', 'list', 'check_position']),
  user_id: z.uuid(),
  client_id: z.uuid().optional(),
  service_id: z.uuid().optional(),
  waitlist_id: z.uuid().optional(),
  preferred_date: z.string().optional(),
  preferred_start_time: z.string().optional(),
  preferred_end_time: z.string().optional(),
});

interface WaitlistEntry {
  readonly waitlist_id: string;
  readonly service_id: string;
  readonly preferred_date: string | null;
  readonly preferred_start_time: string | null;
  readonly status: string;
  readonly position: number;
  readonly created_at: string;
}

interface WaitlistResult {
  readonly entries: readonly WaitlistEntry[];
  readonly position: number | null;
  readonly message: string;
}

export async function main(rawInput: unknown): Promise<[Error | null, WaitlistResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { action, user_id } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });
  const tenantId = parsed.data.client_id ?? user_id ?? '00000000-0000-0000-0000-000000000000';

  try {
    const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
      const userRows = await tx`
        SELECT u.user_id, p.client_id FROM users u
        LEFT JOIN clients p ON p.client_id = u.user_id OR p.email = u.email
        WHERE u.user_id = ${user_id}::uuid LIMIT 1
      `;

      const userRow = userRows[0];
      if (userRow === undefined) {
        return [new Error('User not found'), null];
      }

      let clientId = userRow['client_id'] !== null ? String(userRow['client_id']) : null;
      if (clientId === null && parsed.data.client_id !== undefined) {
        clientId = parsed.data.client_id;
      }

      if (clientId === null) {
        return [new Error('Client record not found'), null];
      }

      switch (action) {
        case 'join': {
          const serviceId = parsed.data.service_id;
          if (serviceId === undefined) {
            return [new Error('service_id is required for join'), null];
          }

          const existingRows = await tx`
            SELECT waitlist_id, status FROM waitlist
            WHERE client_id = ${clientId}::uuid
              AND service_id = ${serviceId}::uuid
              AND status IN ('waiting', 'notified')
            LIMIT 1
          `;

          const existingRow = existingRows[0];
          if (existingRow !== undefined) {
            return [new Error('Already on waitlist for this service'), null];
          }

          const countRows = await tx`
            SELECT COUNT(*) AS cnt FROM waitlist
            WHERE service_id = ${serviceId}::uuid AND status = 'waiting'
          `;

          const position = countRows[0] !== undefined ? Number(countRows[0]['cnt']) + 1 : 1;

          const insertRows = await tx`
            INSERT INTO waitlist (
              client_id, service_id, preferred_date,
              preferred_start_time, preferred_end_time,
              status, position
            ) VALUES (
              ${clientId}::uuid, ${serviceId}::uuid,
              ${parsed.data.preferred_date ?? null},
              ${parsed.data.preferred_start_time ?? null},
              ${parsed.data.preferred_end_time ?? null},
              'waiting', ${position}
            )
            RETURNING waitlist_id
          `;

          const newRow = insertRows[0];
          if (newRow === undefined) {
            return [new Error('Failed to join waitlist'), null];
          }

          return [null, {
            entries: [],
            position: position,
            message: 'Joined waitlist at position ' + String(position),
          }];
        }

        case 'leave': {
          const waitlistId = parsed.data.waitlist_id;
          if (waitlistId === undefined) {
            return [new Error('waitlist_id is required for leave'), null];
          }

          await tx`
            UPDATE waitlist SET status = 'cancelled', updated_at = NOW()
            WHERE waitlist_id = ${waitlistId}::uuid
              AND client_id = ${clientId}::uuid
              AND status IN ('waiting', 'notified')
          `;

          await tx.unsafe(
            "SELECT recalculate_waitlist_positions(service_id) FROM waitlist WHERE waitlist_id = $1::uuid",
            [waitlistId]
          );

          return [null, { entries: [], position: null, message: 'Left waitlist successfully' }];
        }

        case 'list': {
          const rows = await tx`
            SELECT waitlist_id, service_id, preferred_date,
                   preferred_start_time, status, position, created_at
            FROM waitlist
            WHERE client_id = ${clientId}::uuid
              AND status IN ('waiting', 'notified')
            ORDER BY created_at DESC
          `;

          const entries: WaitlistEntry[] = [];
          for (const r of rows) {
            entries.push({
              waitlist_id: String(r['waitlist_id']),
              service_id: String(r['service_id']),
              preferred_date: r['preferred_date'] !== null ? String(r['preferred_date']) : null,
              preferred_start_time: r['preferred_start_time'] !== null ? String(r['preferred_start_time']) : null,
              status: String(r['status']),
              position: Number(r['position']),
              created_at: String(r['created_at']),
            });
          }

          return [null, { entries: entries, position: null, message: 'OK' }];
        }

        case 'check_position': {
          const waitlistId = parsed.data.waitlist_id;
          if (waitlistId === undefined) {
            return [new Error('waitlist_id is required for check_position'), null];
          }

          const rows = await tx`
            SELECT position, status FROM waitlist
            WHERE waitlist_id = ${waitlistId}::uuid
              AND client_id = ${clientId}::uuid
            LIMIT 1
          `;

          const row = rows[0];
          if (row === undefined) {
            return [new Error('Waitlist entry not found'), null];
          }

          return [null, {
            entries: [],
            position: Number(row['position']),
            message: 'Your position: ' + String(row['position']),
          }];
        }

        default: {
          const _exhaustive: never = action;
          return [new Error(`Unknown action: ${String(_exhaustive)}`), null];
        }
      }
    });

    if (txErr !== null) {
      throw txErr;
    }

    return [null, txData];

  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.startsWith('transaction_failed: ')) {
      return [new Error('Internal error: ' + message.substring(20)), null];
    }
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
