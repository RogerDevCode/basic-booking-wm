import postgres from 'postgres';
import type { Result } from '../internal/result/index';

/**
 * withAdminContext — Executes DB logic with app.admin_override = 'true'.
 * Required for login because the user's UUID (which drives RLS) is not
 * known until after the email-based lookup.
 *
 * AGENTS.md §12.4: withTenantContext is the ONLY door. This is its auth-specific variant.
 */
export async function withAdminContext<T>(client: postgres.Sql, operation: (tx: postgres.Sql) => Promise<Result<T>>): Promise<Result<T>> {
    const reserved = await client.reserve();
    try {
    await reserved`BEGIN`;
    // Bypass RLS for the lookup phase
    await reserved.unsafe("SELECT set_config('app.admin_override', 'true', true)");

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
