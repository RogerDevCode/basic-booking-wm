import postgres from 'postgres';
import type { ProviderRow } from './types';

type ServiceIdRow = readonly [string];

export async function getProviderServiceId(tx: postgres.Sql, providerId: string): Promise<string | null> {
  const rows = await tx.values<ServiceIdRow[]>`
    SELECT service_id FROM services
    WHERE provider_id = ${providerId}::uuid AND is_active = true
    ORDER BY service_id
    LIMIT 1
  `;
  const first = rows[0];
  if (first === undefined) return null;
  return first[0] ?? null;
}

export async function getProvider(
  tx: postgres.Sql,
  providerId: string
): Promise<ProviderRow | null> {
  const rows = await tx.values<[string, string, string][]>`
    SELECT provider_id, name, timezone FROM providers
    WHERE provider_id = ${providerId}::uuid AND is_active = true
    LIMIT 1
  `;
  const row = rows[0];
  if (row === undefined) return null;
  return {
    provider_id: row[0] ?? '',
    name: row[1] ?? '',
    timezone: row[2] ?? 'America/Mexico_City',
  };
}