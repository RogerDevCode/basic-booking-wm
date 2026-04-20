/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Client profile CRUD (get/update)
 * DB Tables Used  : clients, users
 * Concurrency Risk: NO — single-row SELECT/UPDATE
 * GCal Calls      : NO
 * Idempotency Key : N/A — profile updates are inherently idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates user_id and profile fields
 */

import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result/index';
import { withTenantContext } from '../internal/tenant-context/index';
import { findOrCreateClient } from "./findOrCreateClient";
import { findUser } from "./findUser";
import { mapToProfileResult } from "./mapToProfileResult";
import { InputSchema, type ProfileResult } from "./types";
import { updateProfile } from "./updateProfile";

// ============================================================================
// WEB PATIENT PROFILE — Client profile CRUD
// ============================================================================

/**
 * Main entry point for patient profile operations.
 * Orchestrates user lookup, client creation/retrieval, and updates.
 */
export async function main(rawInput: unknown): Promise<Result<ProfileResult>> {
  /*
   * ## REASONING TRACE
   * ### Mission Decomposition
   * - Validate input via Zod (InputSchema).
   * - Establish DB connection using env vars.
   * - Execute operations within withTenantContext (RLS protection).
   * - SRP: Decompose into findUser, findOrCreateClient, and updateProfile logic.
   *
   * ### Schema Verification
   * - Tables: users, clients (matching §6 + migrations).
   *
   * ### Failure Mode Analysis
   * - Invalid input → Zod returns error.
   * - Missing DB URL → Configuration error.
   * - User not found → Logical error returned.
   * - DB execution error → Caught and returned as Result.
   *
   * ### SOLID Compliance Check
   * - SRP: Business logic extracted from the main coordinator.
   * - DRY: Shared Result type and withTenantContext used.
   * - KISS: Clear flow from validation to execution to response.
   */

  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [err, data] = await withTenantContext(sql, parsed.data.user_id, async (tx) => {
      // 1. Resolve User
      const [uErr, user] = await findUser(tx, parsed.data.user_id);
      if (uErr !== null || !user) return [uErr ?? new Error('user_not_found'), null];

      // 2. Find or Auto-Create Client
      const [cErr, client] = await findOrCreateClient(tx, parsed.data.user_id, user);
      if (cErr !== null || !client) return [cErr ?? new Error('client_not_found'), null];

      let finalClient = client;

      // 3. Optional Update
      if (parsed.data.action === 'update') {
        const [upErr, updated] = await updateProfile(tx, finalClient['client_id'] as string, parsed.data);
        if (upErr !== null || !updated) return [upErr ?? new Error('update_failed'), null];
        finalClient = updated;
      }

      return [null, mapToProfileResult(finalClient)];
    });

    return [err, data];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error(`FATAL_ERROR: ${message}`), null];
  } finally {
    await sql.end();
  }
}

// ============================================================================
// HELPER FUNCTIONS — SRP focused logic
// ============================================================================
