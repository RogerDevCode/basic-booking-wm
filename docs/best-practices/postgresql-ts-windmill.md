# PostgreSQL 17 con TypeScript y Windmill - Best Practices

## Connection Pooling

### Configuración Base

```typescript
import { Pool } from "pg";

const pool = new Pool({
  max: 25,                    // Máximo conexiones abiertas
  min: 10,                    // Conexiones idle mínimas
  idleTimeoutMillis: 600_000, // Cerrar idle después de 10 min
  connectionTimeoutMillis: 5_000,
  maxUses: 7_500,             // Rotar conexiones después de 7500 usos
});
```

### Pool Sizing - Fórmulas

**Basado en capacidad DB:**
```
availablePerInstance = (DBMaxConnections - ReservedConnections) / AppInstances
MaxConns = availablePerInstance
```

**Basado en CPU:**
```
MaxConns = (CPU cores * 2) + 1
cpuOptimal = os.cpus().length * 3
```

**Recomendado producción:**
- `max`: 25 (ajustar según DB max_connections / instancias)
- `min`: 10-12 (40-50% de max)
- `idleTimeoutMillis`: 600_000 (10 min)
- `connectionTimeoutMillis`: 5_000
- `maxUses`: 7_500 (rotar conexiones viejas)

### Factores de Ajuste

| Factor | Ajuste |
|--------|--------|
| Load Balancer | Reducir `maxUses` a ~3000 + jitter |
| Alta concurrencia | Aumentar `max` gradualmente |
| Managed DB (costo por conexión) | Reducir `min`, cerrar rápido |
| Tráfico alto | Mantener más conexiones warm (`min` 50% de `max`) |

## Transacciones

### Patrón Helper Function

```typescript
import { Pool, PoolClient } from "pg";

type Result<T> = [Error | null, T | null];

async function executeTx<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<Result<T>>,
): Promise<Result<T>> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const [err, result] = await fn(client);

    if (err != null) {
      await client.query("ROLLBACK");
      return [err, null];
    }

    await client.query("COMMIT");
    return [null, result];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    return [err instanceof Error ? err : new Error(String(err)), null];
  } finally {
    client.release();
  }
}
```

### Uso en Booking System

```typescript
const [err, bookingId] = await executeTx(pool, async (client) => {
  // 1. Verificar disponibilidad con SELECT FOR UPDATE
  const [checkErr, available] = await checkAvailability(client, providerId, startTime);
  if (checkErr != null) return [checkErr, null];
  if (!available) return [new Error("Slot not available"), null];

  // 2. Crear booking
  const [createErr, id] = await createBookingRecord(client, bookingData);
  if (createErr != null) return [createErr, null];

  // 3. Registrar en audit log
  await logAuditEntry(client, id, "created");

  return [null, id];
});
```

### Transacción con SERIALIZABLE Isolation

```typescript
async function executeSerializableTx<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<Result<T>>,
): Promise<Result<T>> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

    const [err, result] = await fn(client);

    if (err != null) {
      await client.query("ROLLBACK");
      return [err, null];
    }

    await client.query("COMMIT");
    return [null, result];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    return [err instanceof Error ? err : new Error(String(err)), null];
  } finally {
    client.release();
  }
}
```

## Manejo de Errores

### Error Específico PostgreSQL

```typescript
interface PgError extends Error {
  code: string;
  detail?: string;
  table?: string;
  constraint?: string;
}

function isPgError(err: unknown): err is PgError {
  return err instanceof Error && "code" in err && typeof (err as { code: unknown }).code === "string";
}

function handlePgError(err: PgError): Error {
  switch (err.code) {
    case "23505": // Unique violation
      return new Error("Booking already exists");
    case "23503": // Foreign key violation
      return new Error("Invalid provider or service reference");
    case "40001": // Serialization failure
      return new Error("Serialization failure - retry required");
    case "53300": // Too many connections
      return new Error("Connection pool exhausted");
    case "23514": // Check violation
      return new Error("Data constraint violation");
    case "23502": // Not null violation
      return new Error("Required field missing");
    default:
      return err;
  }
}
```

### Retry Logic para Errores Transitorios

```typescript
async function retryOnSerialization<T>(
  fn: () => Promise<Result<T>>,
  maxRetries: number,
): Promise<Result<T>> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const [err, result] = await fn();

    if (err == null) {
      return [null, result];
    }

    if (isPgError(err) && err.code === "40001") {
      const backoffMs = attempt * attempt * 100;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }

    return [err, null];
  }

  return [new Error("Max retries exceeded"), null];
}
```

## JSONB - Índices y Queries

### Cuándo Usar JSONB

| Usar JSONB | Usar Columnas Tipadas |
|------------|----------------------|
| Schema flexible/dinámico | Campos consultados frecuentemente |
| Metadatos variables | Campos para joins |
| Búsquedas por contención | Campos para ORDER BY / GROUP BY |
| Prototipado rápido | Validación estricta requerida |

### Índices GIN para JSONB

```sql
-- Índice GIN para contención (@>, ?)
CREATE INDEX idx_booking_metadata ON bookings USING GIN (metadata);

-- Índice de expresión para campo específico
CREATE INDEX idx_booking_user_id ON bookings
    USING BTREE ((metadata->>'user_id'));

-- Índice parcial para campos frecuentes
CREATE INDEX idx_booking_premium ON bookings USING GIN (metadata)
    WHERE metadata->>'tier' = 'premium';
```

### Queries Eficientes

```sql
-- ✅ Rápido con GIN index
SELECT * FROM bookings WHERE metadata @> '{"tier": "premium"}';

-- ✅ Rápido con expresión index
SELECT * FROM bookings WHERE metadata->>'user_id' = '123';

-- ❌ Lento (sin index)
SELECT * FROM bookings WHERE metadata->'details'->>'notes' LIKE '%urgent%';
```

### Patrón: Promover Campos Calientes

```sql
-- Si queryeas mucho metadata->>'provider_id', promuévelo a columna
ALTER TABLE bookings ADD COLUMN provider_id UUID;
UPDATE bookings SET provider_id = (metadata->>'provider_id')::UUID;
CREATE INDEX idx_provider_id ON bookings(provider_id);
```

## Esquemas para Booking System

### Tablas Principales

```sql
-- bookings: estado final de reservas
CREATE TABLE bookings (
    booking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL,
    service_id UUID NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    gcal_event_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    EXCLUDE USING gist (
        provider_id WITH =,
        tstzrange(start_time, end_time) WITH &&
    ) WHERE (status NOT IN ('cancelled', 'no_show', 'rescheduled'))
);

-- booking_locks: locks distribuidos
CREATE TABLE booking_locks (
    lock_key VARCHAR(255) PRIMARY KEY,
    owner_token UUID NOT NULL,
    provider_id UUID NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_locks_expires ON booking_locks(expires_at);

-- circuit_breaker_state: estado de circuit breakers
CREATE TABLE circuit_breaker_state (
    service_id VARCHAR(50) PRIMARY KEY,
    state VARCHAR(20) NOT NULL DEFAULT 'closed',
    failure_count INT DEFAULT 0,
    success_count INT DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    timeout_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- dlq_entries: dead letter queue
CREATE TABLE dlq_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_dlq_retry ON dlq_entries(next_retry_at) WHERE next_retry_at IS NOT NULL;
```

### Índices Críticos

```sql
-- Búsquedas por provider + fecha
CREATE INDEX idx_bookings_provider_time ON bookings(provider_id, start_time);

-- Búsquedas por estado
CREATE INDEX idx_bookings_status ON bookings(status);

-- Búsquedas por usuario (en metadata)
CREATE INDEX idx_bookings_chat_id ON bookings USING GIN (metadata)
    WHERE metadata ? 'chat_id';

-- Limpieza de locks expirados
CREATE INDEX idx_locks_expired ON booking_locks(expires_at) WHERE expires_at < NOW();
```

## Windmill - Resource Types

### Uso de RT.Postgresql

```typescript
import * as wmill from "windmill-client";
import { Pool } from "pg";

export async function main(db: RT.Postgresql): Promise<Result<Readonly<Record<string, unknown>>>> {
  const connStr = await wmill.getResource(db);

  const pool = new Pool({ connectionString: connStr });

  try {
    const { rows } = await pool.query("SELECT 1 as check");
    return [null, { check: rows[0].check }];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  } finally {
    await pool.end();
  }
}
```

### Configuración en Windmill

1. Crear resource tipo `postgresql` en UI
2. Path: `f/resources/booking-db`
3. Campos: host, port, user, password, dbname, sslmode
4. Referenciar en script: `main(db: RT.Postgresql)`

### Patrón Recomendado: Pool Singleton

```typescript
// f/internal/db/pool.ts
import { Pool } from "pg";

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool == null) {
    _pool = new Pool({
      max: 25,
      min: 10,
      idleTimeoutMillis: 600_000,
      connectionTimeoutMillis: 5_000,
      maxUses: 7_500,
    });

    _pool.on("error", (err) => {
      console.error("Unexpected pool error:", err.message);
    });
  }

  return _pool;
}
```

## Graceful Shutdown

```typescript
import { Pool } from "pg";

async function gracefulShutdown(pool: Pool): Promise<void> {
  process.on("SIGTERM", async () => {
    console.log("SIGTERM received, closing pool...");
    await pool.end();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("SIGINT received, closing pool...");
    await pool.end();
    process.exit(0);
  });
}
```

## Errores Comunes

### ❌ No Configurar Pool

```typescript
// MAL: Sin límites, puede agotar DB
const client = new Client(connStr);
await client.connect();

// BIEN: Configurar pool
const pool = new Pool({
  max: 25,
  min: 10,
  idleTimeoutMillis: 600_000,
});
```

### ❌ No Verificar Errores de Rows

```typescript
// MAL: Puede leak conexiones
const { rows } = await pool.query("SELECT * FROM bookings");
for (const row of rows) {
  // process
}

// BIEN: Siempre verificar error
const [err, result] = await executeTx(pool, async (client) => {
  const { rows } = await client.query("SELECT * FROM bookings");
  return [null, rows];
});
if (err != null) {
  // handle error
}
```

### ❌ No Usar Prepared Statements

```typescript
// MAL: SQL injection risk, performance
const query = `SELECT * FROM bookings WHERE id = '${id}'`;

// BIEN: Parameterized query
const { rows } = await pool.query("SELECT * FROM bookings WHERE booking_id = $1", [id]);
```

### ❌ Ignorar Timeout en Queries

```typescript
// MAL: Sin timeout, puede bloquear indefinidamente
const { rows } = await pool.query("SELECT * FROM bookings");

// BIEN: Con statement timeout
await pool.query("SET statement_timeout = '5000'");
const { rows } = await pool.query("SELECT * FROM bookings");
```

## Métricas a Monitorear

| Métrica | Alerta Si |
|---------|-----------|
| Conexiones activas | > 80% de max |
| Conexiones idle | < 2 (pool frío) |
| Query duration p95 | > 500ms |
| Transaction rollback rate | > 5% |
| Deadlocks por minuto | > 0 |
| DLQ entries pendientes | > 100 |

## Checklist Producción

- [ ] Pool sizing configurado según fórmula
- [ ] `maxUses` < DB timeout
- [ ] Graceful shutdown implementado
- [ ] Errores PostgreSQL tipificados con PgError
- [ ] Retry logic para errores 40001 (serialization)
- [ ] Índices GIN en JSONB para queries frecuentes
- [ ] Campos calientes promovidos a columnas
- [ ] Unique/GiST constraints para prevenir double-booking
- [ ] DLQ con retry exponencial
- [ ] Health check con `pool.query("SELECT 1")`
- [ ] Métricas de pool expuestas
