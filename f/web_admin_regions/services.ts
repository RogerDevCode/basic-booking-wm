import postgres from 'postgres';
import type { Result } from '../internal/result';
import type { Input, RegionRow, CommuneRow } from './types';

type Sql = postgres.Sql;

export async function listRegions(sql: Sql): Promise<Result<{ regions: RegionRow[]; count: number }>> {
  const rows = await sql.values<[number, string, string, string, boolean, number]>`
    SELECT region_id, name, code, country_code, is_active, sort_order
    FROM regions WHERE is_active = true ORDER BY sort_order ASC, name ASC
  `;
  const regions: RegionRow[] = rows.map((row) => ({
    region_id: row[0],
    name: row[1],
    code: row[2],
    is_active: row[4],
    sort_order: row[5],
  }));
  return [null, { regions, count: regions.length }];
}

export async function listCommunes(sql: Sql, regionId?: number): Promise<Result<{ communes: CommuneRow[]; count: number }>> {
  let rows: [number, string, number, boolean, string][];
  if (regionId != null) {
    rows = await sql.values<[number, string, number, boolean, string]>`
      SELECT c.commune_id, c.name, c.region_id, c.is_active, r.name AS region_name
      FROM communes c JOIN regions r ON r.region_id = c.region_id
      WHERE c.is_active = true AND c.region_id = ${regionId}
      ORDER BY c.name ASC
    `;
  } else {
    rows = await sql.values<[number, string, number, boolean, string]>`
      SELECT c.commune_id, c.name, c.region_id, c.is_active, r.name AS region_name
      FROM communes c JOIN regions r ON r.region_id = c.region_id
      WHERE c.is_active = true ORDER BY r.sort_order ASC, c.name ASC
    `;
  }
  const communes: CommuneRow[] = rows.map((row) => ({
    commune_id: row[0],
    name: row[1],
    region_id: row[2],
    is_active: row[3],
    region_name: row[4],
  }));
  return [null, { communes, count: communes.length }];
}

export async function searchCommunes(sql: Sql, search: string, regionId?: number): Promise<Result<{ communes: CommuneRow[]; count: number }>> {
  const searchPattern = `%${search}%`;
  let rows: [number, string, number, boolean, string][];
  if (regionId != null) {
    rows = await sql.values<[number, string, number, boolean, string]>`
      SELECT c.commune_id, c.name, c.region_id, c.is_active, r.name AS region_name
      FROM communes c JOIN regions r ON r.region_id = c.region_id
      WHERE c.is_active = true AND c.region_id = ${regionId}
        AND LOWER(c.name) LIKE LOWER(${searchPattern})
      ORDER BY c.name ASC LIMIT 50
    `;
  } else {
    rows = await sql.values<[number, string, number, boolean, string]>`
      SELECT c.commune_id, c.name, c.region_id, c.is_active, r.name AS region_name
      FROM communes c JOIN regions r ON r.region_id = c.region_id
      WHERE c.is_active = true AND LOWER(c.name) LIKE LOWER(${searchPattern})
      ORDER BY r.sort_order ASC, c.name ASC LIMIT 50
    `;
  }
  const communes: CommuneRow[] = rows.map((row) => ({
    commune_id: row[0],
    name: row[1],
    region_id: row[2],
    is_active: row[3],
    region_name: row[4],
  }));
  return [null, { communes, count: communes.length }];
}