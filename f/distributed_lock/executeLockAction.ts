import postgres from 'postgres';
import type { Result } from '../internal/result';
import { acquireLock } from "./acquireLock";
import { checkLock } from "./checkLock";
import { cleanupLocks } from "./cleanupLocks";
import { releaseLock } from "./releaseLock";
import { type Input, type LockResult } from "./types";

/**
 * executeLockAction routes the request to specialized handlers.
 * Adheres to OCP by allowing easy addition of new action handlers.
 */
export async function executeLockAction(tx: postgres.Sql, input: Input): Promise<Result<LockResult>> {
    switch (input.action) {
    case 'acquire':
      return acquireLock(tx, input);
    case 'release':
      return releaseLock(tx, input);
    case 'check':
      return checkLock(tx, input);
    case 'cleanup':
      return cleanupLocks(tx);
    default:
      return [new Error(`unsupported_action: ${String(input.action)}`), null];
    }
}
