import { describe, test, expect, vi, beforeEach } from 'vitest';
import { main } from './main';
import { createDbClient } from '../internal/db/client';
import { withTenantContext } from '../internal/tenant-context/index';
import type { Result } from '../internal/result/index';

// ============================================================================
// TEST CONSTANTS
// ============================================================================
const TEST_TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_CLIENT_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

// ============================================================================
// MOCKS SETUP
// ============================================================================
vi.mock('../internal/db/client', () => ({
  createDbClient: vi.fn(),
}));

vi.mock('../internal/tenant-context', () => ({
  withTenantContext: vi.fn(),
}));

/**
 * Interface representing the minimal DB client needed for tests
 */
interface MockSql {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
  values: vi.Mock;
  unsafe: vi.Mock;
  end: vi.Mock;
}

function createMockSql(): MockSql {
  const sql = vi.fn().mockResolvedValue([]) as unknown as MockSql;
  sql.values = vi.fn().mockResolvedValue([]);
  sql.unsafe = vi.fn().mockResolvedValue([]);
  sql.end = vi.fn().mockResolvedValue(undefined);
  return sql;
}

// ============================================================================
// TEST SUITE
// ============================================================================
describe('Booking Orchestrator - Logic & Normalization', () => {
  let mockSql: MockSql;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env['DATABASE_URL'] = 'postgres://localhost:5432/test';

    mockSql = createMockSql();
    vi.mocked(createDbClient).mockReturnValue(mockSql as any); // Type cast for vitest mock compatibility

    vi.mocked(withTenantContext).mockImplementation(async <T>(_sql: unknown, _tenantId: string, op: (tx: any) => Promise<Result<T>>) => {
      return op(mockSql);
    });
  });

  const baseInput = {
    tenant_id: TEST_TENANT_ID,
    client_id: TEST_CLIENT_ID,
  };

  test('should normalize relative date "mañana" and time "10 am"', async () => {
    const result = await main({
      ...baseInput,
      intent: 'crear_cita',
      entities: {
        date: 'mañana',
        time: '10 am'
      },
    });

    // Verification
    expect(result[0]).toBeNull();
    const data = result[1];
    expect(data?.action).toBe('crear_cita');
    
    // Because provider_id is missing, it should hand off to wizard
    expect(data?.nextState?.name).toBe('selecting_specialty');
    expect(data?.nextDraft?.target_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data?.nextDraft?.time_label).toBe('10:00');
  });

  test('should handle missing data with wizard hand-off', async () => {
    const result = await main({
      ...baseInput,
      intent: 'crear_cita',
      entities: {
        provider_name: 'Dr. House'
      },
    });

    expect(result[0]).toBeNull();
    const data = result[1];
    expect(data?.nextState?.name).toBe('selecting_specialty');
    expect(data?.nextDraft?.doctor_name).toBe('Dr. House');
  });

  test('should route to mis_citas if booking_id is missing during cancel', async () => {
    const result = await main({
      ...baseInput,
      intent: 'cancelar_cita',
      entities: {},
    });

    expect(result[0]).toBeNull();
    const data = result[1];
    expect(data?.action).toBe('mis_citas');
    expect(data?.message).toContain('No tienes próximas citas');
  });
});
