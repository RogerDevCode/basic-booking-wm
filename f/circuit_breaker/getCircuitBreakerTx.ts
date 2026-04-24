import postgres from 'postgres';
import { type Result } from "./types.ts";

/**
 * Circuit breaker state table is system-global (no provider_id column).
 * Executes in a transaction without tenant context — no RLS needed.
 */
export async function getCircuitBreakerTx<T>(client: postgres.Sql, operation: (tx: postgres.Sql) => Promise<Result<T>>): Promise<Result<T>> {
    const reserved = await client.reserve();
    try {
    await reserved`BEGIN`;
    const [err, data] = await operation(reserved);
    if (err !== null) {
      await reserved`ROLLBACK`;
      return [err, null];
    }
    await reserved`COMMIT`;
    return [null, data];
    } catch (error: unknown) {
    await reserved`ROLLBACK`.catch(() => { /* ignore */ });
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`transaction_failed: ${msg}`), null];
    } finally {
    reserved.release();
    }
}
