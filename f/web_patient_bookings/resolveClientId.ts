import type { Result } from '../internal/result';
import type { TxClient } from '../internal/tenant-context';

/**
 * Resolves a client_id from a user_id, with a fallback to email match
 * if the direct user_id link is missing.
 */
export async function resolveClientId(tx: TxClient, userId: string): Promise<Result<string>> {
    try {
    const userRows = await tx.values<[string][]>`
      SELECT p.client_id FROM clients p
      INNER JOIN users u ON u.user_id = p.client_id
      WHERE u.user_id = ${userId}::uuid
      LIMIT 1
    `;

    const firstRow = userRows[0];
    if (firstRow !== undefined) {
      return [null, String(firstRow[0])];
    }

    // Fallback: search by email match
    const clientRows = await tx.values<[string][]>`
      SELECT client_id FROM clients
      WHERE email = (SELECT email FROM users WHERE user_id = ${userId}::uuid LIMIT 1)
      LIMIT 1
    `;

    const fallbackRow = clientRows[0];
    if (fallbackRow === undefined) {
      return [new Error(`client_identity_not_found: userId=${userId}`), null];
    }

    return [null, String(fallbackRow[0])];
    } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`identity_resolution_failed: ${msg}`), null];
    }
}
