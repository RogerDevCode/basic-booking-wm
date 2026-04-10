import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDB, teardownTestDB } from './setup-db';
import postgres from 'postgres';

describe('DB Integration Tests', () => {
  let db: postgres.Sql;

  beforeAll(async () => {
    db = await setupTestDB();
  }, 120000);

  afterAll(async () => {
    await teardownTestDB();
  });

  describe('Providers', () => {
    test('Debe crear y consultar un provider', async () => {
      const rows = await db`
        SELECT provider_id, name, email, specialty FROM providers WHERE email = 'test@clinic.com'
      `;
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe('Dr. Test');
      expect(rows[0].specialty).toBe('Medicina General');
    });

    test('Debe actualizar un provider', async () => {
      await db`
        UPDATE providers SET name = 'Dr. Updated' WHERE email = 'test@clinic.com'
      `;
      const rows = await db`SELECT name FROM providers WHERE email = 'test@clinic.com'`;
      expect(rows[0].name).toBe('Dr. Updated');
      // Restore
      await db`UPDATE providers SET name = 'Dr. Test' WHERE email = 'test@clinic.com'`;
    });

    test('Debe respetar email UNIQUE constraint', async () => {
      await expect(db`
        INSERT INTO providers (name, email, specialty)
        VALUES ('Dr. Dup', 'test@clinic.com', 'Cardiologia')
      `).rejects.toThrow();
    });
  });

  describe('Services', () => {
    test('Debe crear y consultar un service', async () => {
      const rows = await db`
        SELECT s.service_id, s.name, s.duration_minutes, p.name as provider_name
        FROM services s JOIN providers p ON p.provider_id = s.provider_id
        WHERE s.name = 'Consulta General'
      `;
      expect(rows.length).toBe(1);
      expect(rows[0].duration_minutes).toBe(30);
      expect(rows[0].provider_name).toBe('Dr. Test');
    });
  });

  describe('Bookings', () => {
    test('Debe crear un booking con idempotencia', async () => {
      const provider = await db`SELECT provider_id FROM providers LIMIT 1`;
      const service = await db`SELECT service_id FROM services LIMIT 1`;
      const patient = await db`SELECT client_id FROM clients LIMIT 1`;

      const startTime = new Date('2026-05-01T10:00:00Z');
      const endTime = new Date('2026-05-01T10:30:00Z');

      const rows = await db`
        INSERT INTO bookings (provider_id, client_id, service_id, start_time, end_time, idempotency_key)
        VALUES (${provider[0].provider_id}, ${patient[0].client_id}, ${service[0].service_id},
                ${startTime.toISOString()}, ${endTime.toISOString()}, 'idem-test-001')
        RETURNING booking_id, status
      `;

      expect(rows.length).toBe(1);
      expect(rows[0].status).toBe('pending');

      // Idempotent insert should fail (unique constraint)
      await expect(db`
        INSERT INTO bookings (provider_id, client_id, service_id, start_time, end_time, idempotency_key)
        VALUES (${provider[0].provider_id}, ${patient[0].client_id}, ${service[0].service_id},
                ${startTime.toISOString()}, ${endTime.toISOString()}, 'idem-test-001')
      `).rejects.toThrow();
    });

    test('Debe prevenir double-booking con exclusion constraint', async () => {
      const provider = await db`SELECT provider_id FROM providers LIMIT 1`;
      const service = await db`SELECT service_id FROM services LIMIT 1`;
      const patient = await db`SELECT client_id FROM clients LIMIT 1`;

      const startTime = new Date('2026-05-01T11:00:00Z');
      const endTime = new Date('2026-05-01T11:30:00Z');

      // First booking should succeed
      await db`
        INSERT INTO bookings (provider_id, client_id, service_id, start_time, end_time, idempotency_key)
        VALUES (${provider[0].provider_id}, ${patient[0].client_id}, ${service[0].service_id},
                ${startTime.toISOString()}, ${endTime.toISOString()}, 'idem-test-002')
      `;

      // Overlapping booking should fail (exclusion constraint)
      const overlapStart = new Date('2026-05-01T11:15:00Z');
      const overlapEnd = new Date('2026-05-01T11:45:00Z');

      await expect(db`
        INSERT INTO bookings (provider_id, client_id, service_id, start_time, end_time, idempotency_key)
        VALUES (${provider[0].provider_id}, ${patient[0].client_id}, ${service[0].service_id},
                ${overlapStart.toISOString()}, ${overlapEnd.toISOString()}, 'idem-test-003')
      `).rejects.toThrow();
    });

    test('Debe permitir booking no-overlapping para el mismo provider', async () => {
      const provider = await db`SELECT provider_id FROM providers LIMIT 1`;
      const service = await db`SELECT service_id FROM services LIMIT 1`;
      const patient = await db`SELECT client_id FROM clients LIMIT 1`;

      const startTime = new Date('2026-05-01T14:00:00Z');
      const endTime = new Date('2026-05-01T14:30:00Z');

      const rows = await db`
        INSERT INTO bookings (provider_id, client_id, service_id, start_time, end_time, idempotency_key)
        VALUES (${provider[0].provider_id}, ${patient[0].client_id}, ${service[0].service_id},
                ${startTime.toISOString()}, ${endTime.toISOString()}, 'idem-test-004')
        RETURNING booking_id
      `;

      expect(rows.length).toBe(1);
    });

    test('Debe permitir booking overlapping si el primero está cancelled', async () => {
      const provider = await db`SELECT provider_id FROM providers LIMIT 1`;
      const service = await db`SELECT service_id FROM services LIMIT 1`;
      const patient = await db`SELECT client_id FROM clients LIMIT 1`;

      const startTime = new Date('2026-05-02T10:00:00Z');
      const endTime = new Date('2026-05-02T10:30:00Z');

      // Create and cancel first booking
      const [first] = await db`
        INSERT INTO bookings (provider_id, client_id, service_id, start_time, end_time, idempotency_key, status)
        VALUES (${provider[0].provider_id}, ${patient[0].client_id}, ${service[0].service_id},
                ${startTime.toISOString()}, ${endTime.toISOString()}, 'idem-test-005', 'cancelled')
        RETURNING booking_id
      `;

      expect(first).toBeDefined();

      // Overlapping booking should succeed (first is cancelled)
      const overlapStart = new Date('2026-05-02T10:15:00Z');
      const overlapEnd = new Date('2026-05-02T10:45:00Z');

      const rows = await db`
        INSERT INTO bookings (provider_id, client_id, service_id, start_time, end_time, idempotency_key)
        VALUES (${provider[0].provider_id}, ${patient[0].client_id}, ${service[0].service_id},
                ${overlapStart.toISOString()}, ${overlapEnd.toISOString()}, 'idem-test-006')
        RETURNING booking_id
      `;

      expect(rows.length).toBe(1);
    });

    test('Debe actualizar status de booking', async () => {
      const provider = await db`SELECT provider_id FROM providers LIMIT 1`;
      const service = await db`SELECT service_id FROM services LIMIT 1`;
      const patient = await db`SELECT client_id FROM clients LIMIT 1`;

      const startTime = new Date('2026-05-03T10:00:00Z');
      const endTime = new Date('2026-05-03T10:30:00Z');

      const [booking] = await db`
        INSERT INTO bookings (provider_id, client_id, service_id, start_time, end_time, idempotency_key)
        VALUES (${provider[0].provider_id}, ${patient[0].client_id}, ${service[0].service_id},
                ${startTime.toISOString()}, ${endTime.toISOString()}, 'idem-test-007')
        RETURNING booking_id
      `;

      await db`
        UPDATE bookings SET status = 'confirmed' WHERE booking_id = ${booking.booking_id}
      `;

      const [updated] = await db`SELECT status FROM bookings WHERE booking_id = ${booking.booking_id}`;
      expect(updated.status).toBe('confirmed');
    });
  });

  describe('Provider Schedules', () => {
    test('Debe respetar UNIQUE constraint en schedule', async () => {
      const provider = await db`SELECT provider_id FROM providers LIMIT 1`;

      // First insert should succeed (already seeded)
      // Duplicate should fail
      await expect(db`
        INSERT INTO provider_schedules (provider_id, day_of_week, start_time, end_time)
        VALUES (${provider[0].provider_id}, 1, '09:00', '17:00')
      `).rejects.toThrow();
    });

    test('Debe consultar horarios por día', async () => {
      const provider = await db`SELECT provider_id FROM providers LIMIT 1`;

      const rows = await db`
        SELECT day_of_week, start_time, end_time FROM provider_schedules
        WHERE provider_id = ${provider[0].provider_id} AND day_of_week = 1
      `;

      expect(rows.length).toBe(1);
      expect(String(rows[0].start_time)).toBe('09:00:00');
      expect(String(rows[0].end_time)).toBe('17:00:00');
    });
  });

  describe('Booking Audit Log', () => {
    test('Debe registrar cambios de status', async () => {
      const provider = await db`SELECT provider_id FROM providers LIMIT 1`;
      const service = await db`SELECT service_id FROM services LIMIT 1`;
      const patient = await db`SELECT client_id FROM clients LIMIT 1`;

      const startTime = new Date('2026-05-04T10:00:00Z');
      const endTime = new Date('2026-05-04T10:30:00Z');

      const [booking] = await db`
        INSERT INTO bookings (provider_id, client_id, service_id, start_time, end_time, idempotency_key)
        VALUES (${provider[0].provider_id}, ${patient[0].client_id}, ${service[0].service_id},
                ${startTime.toISOString()}, ${endTime.toISOString()}, 'idem-test-008')
        RETURNING booking_id
      `;

      await db`
        INSERT INTO booking_audit (booking_id, from_status, to_status, changed_by, reason)
        VALUES (${booking.booking_id}, 'pending', 'confirmed', 'system', 'Auto-confirmed')
      `;

      const auditRows = await db`
        SELECT from_status, to_status, changed_by, reason FROM booking_audit
        WHERE booking_id = ${booking.booking_id}
      `;

      expect(auditRows.length).toBe(1);
      expect(auditRows[0].from_status).toBe('pending');
      expect(auditRows[0].to_status).toBe('confirmed');
      expect(auditRows[0].changed_by).toBe('system');
    });
  });

  describe('Circuit Breaker State', () => {
    test('Debe actualizar estado de circuit breaker', async () => {
      await db`
        UPDATE circuit_breaker_state SET state = 'open', failure_count = 5
        WHERE service_id = 'gcal'
      `;

      const [row] = await db`SELECT state, failure_count FROM circuit_breaker_state WHERE service_id = 'gcal'`;
      expect(row.state).toBe('open');
      expect(row.failure_count).toBe(5);

      // Reset
      await db`
        UPDATE circuit_breaker_state SET state = 'closed', failure_count = 0 WHERE service_id = 'gcal'
      `;
    });
  });

  describe('Patients with JSONB metadata', () => {
    test('Debe guardar y consultar metadata JSONB', async () => {
      const patient = await db`SELECT client_id FROM clients LIMIT 1`;

      await db`
        UPDATE clients SET metadata = '{"reminder_preferences": {"telegram_24h": true, "gmail_24h": false}}'::jsonb
        WHERE client_id = ${patient[0].client_id}
      `;

      const [row] = await db`SELECT metadata FROM clients WHERE client_id = ${patient[0].client_id}`;
      expect(row.metadata).toBeDefined();
      const prefs = row.metadata as Record<string, unknown>;
      expect(prefs['reminder_preferences']).toBeDefined();
    });

    test('Debe consultar pacientes con JSONB operator @>', async () => {
      const patient = await db`SELECT client_id FROM clients LIMIT 1`;

      await db`
        UPDATE clients SET metadata = '{"tier": "premium"}'::jsonb
        WHERE client_id = ${patient[0].client_id}
      `;

      const rows = await db`
        SELECT client_id, name FROM clients
        WHERE metadata @> '{"tier": "premium"}'::jsonb
      `;

      expect(rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Transactions', () => {
    test('Debe hacer rollback en caso de error', async () => {
      const initialCount = await db`SELECT COUNT(*) as cnt FROM bookings`;
      const countBefore = Number(initialCount[0].cnt);

      try {
        await db.begin(async (tx) => {
          const provider = await tx.unsafe('SELECT provider_id FROM providers LIMIT 1');
          const service = await tx.unsafe('SELECT service_id FROM services LIMIT 1');
          const patient = await tx.unsafe('SELECT client_id FROM clients LIMIT 1');

          await tx.unsafe(
            `INSERT INTO bookings (provider_id, client_id, service_id, start_time, end_time, idempotency_key)
             VALUES ('${provider[0].provider_id}', '${patient[0].client_id}', '${service[0].service_id}',
                     '2026-06-01T10:00:00Z', '2026-06-01T10:30:00Z', 'idem-tx-test')`
          );

          // Force error
          await tx.unsafe('SELECT * FROM nonexistent_table');
        });
      } catch {
        // Expected
      }

      const finalCount = await db`SELECT COUNT(*) as cnt FROM bookings`;
      const countAfter = Number(finalCount[0].cnt);
      expect(countAfter).toBe(countBefore);
    });
  });

  describe('Booking Locks', () => {
    test('Debe adquirir y liberar lock', async () => {
      const [lock] = await db`
        INSERT INTO booking_locks (lock_key, owner_token, expires_at)
        VALUES ('test-lock-001', 'owner-abc', NOW() + INTERVAL '5 minutes')
        RETURNING lock_id, lock_key
      `;

      expect(lock.lock_key).toBe('test-lock-001');

      // Duplicate lock should fail
      await expect(db`
        INSERT INTO booking_locks (lock_key, owner_token, expires_at)
        VALUES ('test-lock-001', 'owner-xyz', NOW() + INTERVAL '5 minutes')
      `).rejects.toThrow();

      // Cleanup
      await db`DELETE FROM booking_locks WHERE lock_key = 'test-lock-001'`;
    });

    test('Debe limpiar locks expirados', async () => {
      await db`
        INSERT INTO booking_locks (lock_key, owner_token, expires_at)
        VALUES ('expired-lock', 'owner-123', NOW() - INTERVAL '1 hour')
      `;

      const before = await db`SELECT COUNT(*) as cnt FROM booking_locks WHERE lock_key = 'expired-lock'`;
      expect(Number(before[0].cnt)).toBe(1);

      await db`DELETE FROM booking_locks WHERE expires_at < NOW()`;

      const after = await db`SELECT COUNT(*) as cnt FROM booking_locks WHERE lock_key = 'expired-lock'`;
      expect(Number(after[0].cnt)).toBe(0);
    });
  });

  describe('Waitlist', () => {
    test('Debe agregar paciente a waitlist', async () => {
      const patient = await db`SELECT client_id FROM clients LIMIT 1`;
      const service = await db`SELECT service_id FROM services LIMIT 1`;

      const [entry] = await db`
        INSERT INTO waitlist (client_id, service_id, status, position)
        VALUES (${patient[0].client_id}, ${service[0].service_id}, 'waiting', 1)
        RETURNING waitlist_id, status
      `;

      expect(entry.status).toBe('waiting');

      // Cleanup
      await db`DELETE FROM waitlist WHERE waitlist_id = ${entry.waitlist_id}`;
    });
  });

  describe('Schedule Overrides', () => {
    test('Debe crear override para bloquear un día', async () => {
      const provider = await db`SELECT provider_id FROM providers LIMIT 1`;

      const [override] = await db`
        INSERT INTO schedule_overrides (provider_id, override_date, is_blocked, reason)
        VALUES (${provider[0].provider_id}, '2026-05-10', true, 'Feriado')
        RETURNING override_id, is_blocked, reason
      `;

      expect(override.is_blocked).toBe(true);
      expect(override.reason).toBe('Feriado');

      // Cleanup
      await db`DELETE FROM schedule_overrides WHERE override_id = ${override.override_id}`;
    });
  });

  describe('Knowledge Base', () => {
    test('Debe insertar y consultar entries', async () => {
      await db`
        INSERT INTO knowledge_base (category, title, content)
        VALUES ('horarios', 'Horario de atención', 'El consultorio atiende de lunes a viernes de 9 a 17')
      `;

      const rows = await db`
        SELECT kb_id, category, title FROM knowledge_base
        WHERE category = 'horarios'
      `;

      expect(rows.length).toBeGreaterThanOrEqual(1);

      // Cleanup
      await db`DELETE FROM knowledge_base WHERE category = 'horarios'`;
    });
  });
});
