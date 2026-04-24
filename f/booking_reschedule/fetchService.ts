import type { ServiceRow } from '../internal/db-types/index.ts';
import type { Result } from '../internal/result/index.ts';
import { type Sql } from "./types.ts";

export async function fetchService(sql: Sql, id: string): Promise<Result<ServiceRow>> {
    try {
    const rows = await sql<ServiceRow[]>`
      SELECT service_id, duration_minutes, is_active FROM services
      WHERE service_id = ${id}::uuid LIMIT 1
    `;
    const row = rows[0];
    if (!row) return [new Error(`Service ${id} not found`), null];
    if (!row.is_active) return [new Error(`Service ${id} is inactive`), null];
    return [null, row];
    } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
    }
}
