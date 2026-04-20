import type postgres from 'postgres';
import type { Result } from '../internal/result/index';
import type { Input, WaitlistResult, WaitlistEntry } from './types';

/**
 * Resolves the client_id for the given user_id.
 */
export async function resolveClientId(tx: postgres.Sql, userId: string, inputClientId?: string): Promise<Result<string>> {
  const rows = await tx`
    SELECT u.user_id, p.client_id FROM users u
    LEFT JOIN clients p ON p.client_id = u.user_id OR p.email = u.email
    WHERE u.user_id = ${userId}::uuid LIMIT 1
  `;

  const row = rows[0];
  if (row === undefined) {
    return [new Error('user_not_found'), null];
  }

  const clientId = row['client_id'] !== null ? String(row['client_id']) : (inputClientId ?? null);
  if (clientId === null) {
    return [new Error('client_record_not_found'), null];
  }

  return [null, clientId];
}

/**
 * Logic for joining the waitlist.
 * Uses SELECT FOR UPDATE on the service to prevent position calculation races.
 */
export async function handleJoin(tx: postgres.Sql, clientId: string, data: Input): Promise<Result<WaitlistResult>> {
  const { service_id: serviceId } = data;
  if (serviceId === undefined) {
    return [new Error('service_id_required'), null];
  }

  // Lock the service row to serialize waitlist joins for this service
  const serviceCheck = await tx`SELECT 1 FROM services WHERE service_id = ${serviceId}::uuid FOR UPDATE`;
  if (serviceCheck.length === 0) {
    return [new Error('service_not_found'), null];
  }

  const existingRows = await tx`
    SELECT waitlist_id FROM waitlist
    WHERE client_id = ${clientId}::uuid
      AND service_id = ${serviceId}::uuid
      AND status IN ('waiting', 'notified')
    LIMIT 1
  `;

  if (existingRows.length > 0) {
    return [new Error('already_on_waitlist'), null];
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
      ${data.preferred_date ?? null},
      ${data.preferred_start_time ?? null},
      ${data.preferred_end_time ?? null},
      'waiting', ${position}
    )
    RETURNING waitlist_id
  `;

  if (insertRows.length === 0) {
    return [new Error('insert_failed'), null];
  }

  return [null, {
    entries: [],
    position,
    message: `Joined waitlist at position ${String(position)}`,
  }];
}

/**
 * Logic for leaving the waitlist.
 */
export async function handleLeave(tx: postgres.Sql, clientId: string, waitlistId?: string): Promise<Result<WaitlistResult>> {
  if (waitlistId === undefined) {
    return [new Error('waitlist_id_required'), null];
  }

  const updateRows = await tx`
    UPDATE waitlist SET status = 'cancelled', updated_at = NOW()
    WHERE waitlist_id = ${waitlistId}::uuid
      AND client_id = ${clientId}::uuid
      AND status IN ('waiting', 'notified')
    RETURNING service_id
  `;

  if (updateRows.length > 0) {
    // Recalculate positions for remaining entries in this service
    await tx.unsafe(
      "SELECT recalculate_waitlist_positions(service_id) FROM waitlist WHERE waitlist_id = $1::uuid",
      [waitlistId]
    );
  }

  return [null, { entries: [], position: null, message: 'Left waitlist successfully' }];
}

/**
 * Lists all active waitlist entries for the client.
 */
export async function handleList(tx: postgres.Sql, clientId: string): Promise<Result<WaitlistResult>> {
  const rows = await tx`
    SELECT waitlist_id, service_id, preferred_date,
           preferred_start_time, status, position, created_at
    FROM waitlist
    WHERE client_id = ${clientId}::uuid
      AND status IN ('waiting', 'notified')
    ORDER BY created_at DESC
  `;

  const entries: WaitlistEntry[] = rows.map(r => ({
    waitlist_id: String(r['waitlist_id']),
    service_id: String(r['service_id']),
    preferred_date: r['preferred_date'] !== null ? String(r['preferred_date']) : null,
    preferred_start_time: r['preferred_start_time'] !== null ? String(r['preferred_start_time']) : null,
    status: String(r['status']),
    position: Number(r['position']),
    created_at: String(r['created_at']),
  }));

  return [null, { entries, position: null, message: 'OK' }];
}

/**
 * Checks the current position of a specific waitlist entry.
 */
export async function handleCheckPosition(tx: postgres.Sql, clientId: string, waitlistId?: string): Promise<Result<WaitlistResult>> {
  if (waitlistId === undefined) {
    return [new Error('waitlist_id_required'), null];
  }

  const rows = await tx`
    SELECT position FROM waitlist
    WHERE waitlist_id = ${waitlistId}::uuid
      AND client_id = ${clientId}::uuid
    LIMIT 1
  `;

  const row = rows[0];
  if (row === undefined) {
    return [new Error('entry_not_found'), null];
  }

  const position = Number(row['position']);
  return [null, {
    entries: [],
    position,
    message: `Your position: ${String(position)}`,
  }];
}
