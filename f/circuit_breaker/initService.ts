import postgres from 'postgres';

export async function initService(tx: postgres.Sql, serviceId: string): Promise<void> {
    await tx`
    INSERT INTO circuit_breaker_state (service_id, state, failure_count, success_count)
    VALUES (${serviceId}, 'closed', 0, 0)
    ON CONFLICT (service_id) DO NOTHING
  `;
}
