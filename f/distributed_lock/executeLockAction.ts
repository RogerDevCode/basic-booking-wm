import postgres from 'postgres';
import type { Result } from '../internal/result/index.ts';
import { acquireLock } from "./acquireLock.ts";
import { checkLock } from "./checkLock.ts";
import { cleanupLocks } from "./cleanupLocks.ts";
import { releaseLock } from "./releaseLock.ts";
import { type Input, type LockResult } from "./types.ts";

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
