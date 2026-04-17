import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';
import type { InputType, ResolvedContext } from './types';
import { getEntity } from './getEntity';
import { resolveDate, resolveTime } from '../internal/date-resolver';

export async function resolveContext(
  input: Readonly<InputType>
): Promise<Result<ResolvedContext>> {
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) return [new Error('DATABASE_URL not set'), null];

  const sql = createDbClient({ url: dbUrl });

  let tenantId = input.tenant_id;
  let clientId = input.client_id;
  let providerId = input.provider_id ?? getEntity(input.entities, 'provider_id');
  let serviceId = input.service_id ?? getEntity(input.entities, 'service_id');
  let resolvedDate = input.date ?? getEntity(input.entities, 'date');
  let resolvedTime = input.time ?? getEntity(input.entities, 'time');

  if (resolvedDate) {
    const abs = resolveDate(resolvedDate);
    if (abs) resolvedDate = abs;
  }
  if (resolvedTime) {
    const abs = resolveTime(resolvedTime);
    if (abs) resolvedTime = abs;
  }

  if (!tenantId) {
    const providerRows = await sql`SELECT provider_id FROM providers LIMIT 1`;
    const first = providerRows[0];
    if (first && typeof first['provider_id'] === 'string') {
      tenantId = first['provider_id'];
      providerId ??= tenantId;
    }
  }

  if (!tenantId) return [new Error('Could not resolve tenant_id'), null];

  if (!clientId && input.telegram_chat_id) {
    const clientRows = await sql`
      SELECT client_id FROM clients WHERE telegram_chat_id = ${input.telegram_chat_id} LIMIT 1
    `;
    const first = clientRows[0];
    if (first && typeof first['client_id'] === 'string') {
      clientId = first['client_id'];
    } else {
      const inserted = await sql`
        INSERT INTO clients (name, telegram_chat_id)
        VALUES (${input.telegram_name ?? 'Usuario Telegram'}, ${input.telegram_chat_id})
        RETURNING client_id
      `;
      const insertedRow = inserted[0];
      if (insertedRow && typeof insertedRow['client_id'] === 'string') {
        clientId = insertedRow['client_id'];
      }
    }
  }

  if (!serviceId && providerId) {
    const serviceRows = await sql`
      SELECT service_id FROM services WHERE provider_id = ${providerId}::uuid LIMIT 1
    `;
    const first = serviceRows[0];
    if (first && typeof first['service_id'] === 'string') {
      serviceId = first['service_id'];
    }
  }

  return [null, {
    tenantId,
    clientId,
    providerId,
    serviceId,
    date: resolvedDate,
    time: resolvedTime,
  }];
}
