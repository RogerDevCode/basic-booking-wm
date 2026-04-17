import { z } from 'zod';
import type { TxClient } from '../internal/tenant-context';
import type { Result } from '../internal/result';
import { ActionSchema, type Input, type SpecialtyRow } from './types';

export const SpecialtyRepository = {
  async list(tx: TxClient): Promise<Result<readonly SpecialtyRow[]>> {
    try {
      const rows = await tx<SpecialtyRow[]>`
        SELECT specialty_id, name, description, category, is_active, sort_order, created_at
        FROM specialties ORDER BY sort_order ASC, name ASC
      `;
      return [null, Object.freeze(rows)];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return [new Error(`list_failed: ${msg}`), null];
    }
  },

  async create(tx: TxClient, input: Input): Promise<Result<SpecialtyRow>> {
    try {
      const name = input.name;
      if (!name) return [new Error('create_failed: name is required'), null];

      const rows = await tx<SpecialtyRow[]>`
        INSERT INTO specialties (name, description, category, sort_order)
        VALUES (${name}, ${input.description ?? null}, ${input.category ?? 'Medicina'}, ${input.sort_order ?? 99})
        RETURNING specialty_id, name, description, category, is_active, sort_order, created_at
      `;
      const row = rows[0];
      if (!row) return [new Error('create_failed: no row returned'), null];
      return [null, Object.freeze(row)];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return [new Error(`create_failed: ${msg}`), null];
    }
  },

  async update(tx: TxClient, id: string, input: Input): Promise<Result<SpecialtyRow>> {
    try {
      const updateData: Record<string, unknown> = {};
      if (input.name !== undefined) updateData['name'] = input.name;
      if (input.description !== undefined) updateData['description'] = input.description;
      if (input.category !== undefined) updateData['category'] = input.category;
      if (input.sort_order !== undefined) updateData['sort_order'] = input.sort_order;

      if (Object.keys(updateData).length === 0) {
        return [new Error('update_failed: no fields provided'), null];
      }

      const rows = await tx<SpecialtyRow[]>`
        UPDATE specialties SET ${tx(updateData)}
        WHERE specialty_id = ${id}::uuid
        RETURNING specialty_id, name, description, category, is_active, sort_order, created_at
      `;
      const row = rows[0];
      if (!row) return [new Error(`update_failed: specialty '${id}' not found`), null];
      return [null, Object.freeze(row)];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return [new Error(`update_failed: ${msg}`), null];
    }
  },

  async delete(tx: TxClient, id: string): Promise<Result<{ readonly deleted: boolean }>> {
    try {
      await tx`DELETE FROM specialties WHERE specialty_id = ${id}::uuid`;
      return [null, { deleted: true }];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return [new Error(`delete_failed: ${msg}`), null];
    }
  },

  async setStatus(tx: TxClient, id: string, active: boolean): Promise<Result<{ readonly specialty_id: string; readonly is_active: boolean }>> {
    try {
      const rows = await tx`
        UPDATE specialties SET is_active = ${active}
        WHERE specialty_id = ${id}::uuid
        RETURNING specialty_id
      `;
      if (rows.length === 0) return [new Error(`status_update_failed: specialty '${id}' not found`), null];
      return [null, { specialty_id: id, is_active: active }];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return [new Error(`status_update_failed: ${msg}`), null];
    }
  }
};

type ActionHandler = (tx: TxClient, input: Input) => Promise<Result<unknown>>;

export const Handlers: Readonly<Record<z.infer<typeof ActionSchema>, ActionHandler>> = {
  list: (tx) => SpecialtyRepository.list(tx),
  create: (tx, input) => SpecialtyRepository.create(tx, input),
  update: (tx, input) => {
    const id = input.specialty_id;
    if (!id) return Promise.resolve([new Error('update_failed: specialty_id is required'), null]);
    return SpecialtyRepository.update(tx, id, input);
  },
  delete: (tx, input) => {
    const id = input.specialty_id;
    if (!id) return Promise.resolve([new Error('delete_failed: specialty_id is required'), null]);
    return SpecialtyRepository.delete(tx, id);
  },
  activate: (tx, input) => {
    const id = input.specialty_id;
    if (!id) return Promise.resolve([new Error('activate_failed: specialty_id is required'), null]);
    return SpecialtyRepository.setStatus(tx, id, true);
  },
  deactivate: (tx, input) => {
    const id = input.specialty_id;
    if (!id) return Promise.resolve([new Error('deactivate_failed: specialty_id is required'), null]);
    return SpecialtyRepository.setStatus(tx, id, false);
  }
};
