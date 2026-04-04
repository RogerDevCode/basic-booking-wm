import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';

let container: StartedPostgreSqlContainer | null = null;
let sql: postgres.Sql | null = null;

export async function setupTestDB(): Promise<postgres.Sql> {
  if (sql != null) return sql;

  container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('test_booking')
    .withUsername('test')
    .withPassword('test')
    .withExposedPorts(5432)
    .start();

  const dbUrl = container.getConnectionUri();
  sql = postgres(dbUrl, { ssl: false });

  await createSchema(sql);
  return sql;
}

export async function teardownTestDB(): Promise<void> {
  if (sql != null) {
    await sql.end();
    sql = null;
  }
  if (container != null) {
    await container.stop();
    container = null;
  }
}

async function createSchema(db: postgres.Sql): Promise<void> {
  await db`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
  await db`CREATE EXTENSION IF NOT EXISTS "btree_gist"`;
  // vector extension requires pgvector — skip in test env
  // await db`CREATE EXTENSION IF NOT EXISTS "vector"`;

  await db`
    CREATE TABLE IF NOT EXISTS providers (
      provider_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      specialty TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
      telegram_chat_id TEXT,
      gcal_calendar_id TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS services (
      service_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id UUID NOT NULL REFERENCES providers(provider_id),
      name TEXT NOT NULL,
      description TEXT,
      duration_minutes INT NOT NULL DEFAULT 30,
      buffer_minutes INT NOT NULL DEFAULT 10,
      price_cents INT DEFAULT 0,
      currency TEXT DEFAULT 'MXN',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS patients (
      patient_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT,
      telegram_chat_id TEXT,
      gcal_calendar_id TEXT,
      timezone TEXT DEFAULT 'America/Mexico_City',
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS provider_schedules (
      schedule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id UUID NOT NULL REFERENCES providers(provider_id),
      day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      is_active BOOLEAN DEFAULT true,
      UNIQUE(provider_id, day_of_week, start_time)
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS schedule_overrides (
      override_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id UUID NOT NULL REFERENCES providers(provider_id),
      override_date DATE NOT NULL,
      is_blocked BOOLEAN DEFAULT false,
      start_time TIME,
      end_time TIME,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(provider_id, override_date)
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS bookings (
      booking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id UUID NOT NULL REFERENCES providers(provider_id),
      patient_id UUID NOT NULL REFERENCES patients(patient_id),
      service_id UUID NOT NULL REFERENCES services(service_id),
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      idempotency_key TEXT UNIQUE NOT NULL,
      cancellation_reason TEXT,
      cancelled_by TEXT,
      rescheduled_from UUID,
      rescheduled_to UUID,
      notes TEXT,
      gcal_provider_event_id TEXT,
      gcal_patient_event_id TEXT,
      gcal_sync_status TEXT DEFAULT 'pending',
      gcal_retry_count INT DEFAULT 0,
      gcal_last_sync TIMESTAMPTZ,
      notification_sent BOOLEAN DEFAULT false,
      reminder_24h_sent BOOLEAN DEFAULT false,
      reminder_2h_sent BOOLEAN DEFAULT false,
      reminder_30min_sent BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      EXCLUDE USING gist (
        provider_id WITH =,
        tstzrange(start_time, end_time) WITH &&
      ) WHERE (status NOT IN ('cancelled', 'no_show', 'rescheduled'))
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS booking_audit (
      audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id UUID NOT NULL REFERENCES bookings(booking_id),
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      actor_id UUID,
      reason TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS booking_locks (
      lock_id SERIAL PRIMARY KEY,
      lock_key TEXT NOT NULL UNIQUE,
      owner_token TEXT NOT NULL,
      provider_id UUID,
      start_time TIMESTAMPTZ,
      acquired_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS booking_dlq (
      dlq_id SERIAL PRIMARY KEY,
      booking_id UUID,
      provider_id UUID,
      service_id UUID,
      failure_reason TEXT NOT NULL,
      last_error_message TEXT NOT NULL,
      last_error_stack TEXT,
      original_payload JSONB NOT NULL,
      idempotency_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      resolved_by TEXT,
      resolution_notes TEXT
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS circuit_breaker_state (
      service_id TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'closed',
      failure_count INT DEFAULT 0,
      success_count INT DEFAULT 0,
      failure_threshold INT DEFAULT 5,
      success_threshold INT DEFAULT 3,
      timeout_seconds INT DEFAULT 300,
      opened_at TIMESTAMPTZ,
      half_open_at TIMESTAMPTZ,
      last_failure_at TIMESTAMPTZ,
      last_success_at TIMESTAMPTZ,
      last_error_message TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS waitlist (
      waitlist_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patients(patient_id),
      service_id UUID NOT NULL REFERENCES services(service_id),
      preferred_date DATE,
      preferred_start_time TIME,
      preferred_end_time TIME,
      status TEXT NOT NULL DEFAULT 'waiting',
      position INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS clinical_notes (
      note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id UUID NOT NULL REFERENCES bookings(booking_id),
      patient_id UUID NOT NULL REFERENCES patients(patient_id),
      provider_id UUID NOT NULL REFERENCES providers(provider_id),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS knowledge_base (
      kb_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS email_bounces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL,
      bounce_type VARCHAR(50),
      reason TEXT,
      booking_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      notified_at TIMESTAMPTZ
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS system_config (
      config_key TEXT PRIMARY KEY,
      config_value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Seed test data
  const [provider] = await db`
    INSERT INTO providers (name, email, specialty, timezone)
    VALUES ('Dr. Test', 'test@clinic.com', 'Medicina General', 'America/Argentina/Buenos_Aires')
    RETURNING provider_id
  `;

  const [service] = await db`
    INSERT INTO services (provider_id, name, duration_minutes, buffer_minutes)
    VALUES (${provider.provider_id}, 'Consulta General', 30, 10)
    RETURNING service_id
  `;

  const [patient] = await db`
    INSERT INTO patients (name, email, phone)
    VALUES ('Test Patient', 'patient@test.com', '+5491112345678')
    RETURNING patient_id
  `;

  await db`
    INSERT INTO provider_schedules (provider_id, day_of_week, start_time, end_time)
    VALUES
      (${provider.provider_id}, 1, '09:00', '17:00'),
      (${provider.provider_id}, 2, '09:00', '17:00'),
      (${provider.provider_id}, 3, '09:00', '17:00'),
      (${provider.provider_id}, 4, '09:00', '17:00'),
      (${provider.provider_id}, 5, '09:00', '17:00')
  `;

  await db`
    INSERT INTO circuit_breaker_state (service_id, state, failure_count, success_count)
    VALUES
      ('gcal', 'closed', 0, 0),
      ('telegram', 'closed', 0, 0),
      ('gmail', 'closed', 0, 0)
  `;
}
