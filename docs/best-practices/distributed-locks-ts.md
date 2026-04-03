# Distributed Locks en TypeScript con Redis y PostgreSQL - Best Practices

## Redlock vs Advisory Locks

### Comparación

| Característica | Redis Redlock | PostgreSQL Advisory Locks |
|----------------|---------------|---------------------------|
| **Infraestructura** | Requiere Redis | Usa PostgreSQL existente |
| **Complejidad** | Media (librería redlock) | Baja (funciones built-in) |
| **Performance** | Muy alta (in-memory) | Media (database lock) |
| **TTL Automático** | ✅ Sí (con SET PX) | ❌ No (manual o transaction-level) |
| **Auto-release** | ✅ Sí (key expiry) | ⚠️ Solo session disconnect |
| **Lock Stale** | Riesgo si clock drift | No (centralizado) |
| **Recomendado** | Alta concurrencia, microservicios | Monolito, ya usa Postgres |

### Cuándo Usar Cada Uno

```typescript
// ✅ Usar Redis Redlock cuando:
// - Múltiples servicios independientes
// - Alta concurrencia (>1000 locks/segundo)
// - Ya tienes Redis cluster
// - Necesitas TTL automático

// ✅ Usar PostgreSQL Advisory Locks cuando:
// - Ya usas PostgreSQL
// - Quieres simplicidad
// - Locks de larga duración
// - Menos concurrencia
```

## Redis Redlock Implementation

### Algoritmo Redlock

```
1. Obtener timestamp actual (ms)
2. Para cada instancia Redis (5):
   - Intentar adquirir lock con SET key value NX PX ttl
3. Contar instancias donde se adquirió lock
4. Si >= 3 (quórum):
   - Lock adquirido
   - Validez = TTL - tiempo_transcurrido - clock_drift
5. Si < 3:
   - Liberar locks en todas las instancias
   - Retornar fallo
```

### Implementación con `redlock` (npm)

```typescript
import Redlock from "redlock";
import { createClient, type RedisClientType } from "redis";

type Result<T> = [Error | null, T | null];

async function createRedlock(
  redisClients: RedisClientType[],
): Promise<Redlock> {
  return new Redlock(redisClients, {
    retryCount: 3,
    retryDelay: 200,
    retryJitter: 50,
    automaticExtensionThreshold: 500,
  });
}

async function acquireDistributedLock(
  redlock: Redlock,
  resource: string,
  ttlMs: number,
): Promise<Result<Redlock.Lock>> {
  try {
    const lock = await redlock.acquire([resource], ttlMs);
    return [null, lock];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}

async function releaseDistributedLock(
  lock: Redlock.Lock,
): Promise<Result<null>> {
  try {
    await lock.release();
    return [null, null];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

### Uso en script Windmill

```typescript
import Redlock from "redlock";
import { createClient } from "redis";

export async function main(
  providerId: string,
  startTime: string,
  operation: string,
): Promise<Result<Readonly<Record<string, unknown>>>> {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();

  const redlock = await createRedlock([client]);
  const resource = `lock:${providerId}:${startTime}`;

  const [lockErr, lock] = await acquireDistributedLock(redlock, resource, 300_000);
  if (lockErr != null) {
    await client.quit();
    return [null, { acquired: false, error: lockErr.message }];
  }

  try {
    const result = await executeBookingOperation(providerId, startTime, operation);
    return [null, { acquired: true, result }];
  } finally {
    const [releaseErr] = await releaseDistributedLock(lock);
    if (releaseErr != null) {
      console.error("Failed to release lock:", releaseErr.message);
    }
    await client.quit();
  }
}
```

### Implementación Manual con Lua Script (ioredis)

```typescript
import Redis from "ioredis";
import { randomUUID } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL);

const LOCK_SCRIPT = `
  if redis.call("SET", KEYS[1], ARGV[1], "NX", "PX", ARGV[2]) then
    return 1
  else
    return 0
  end
`;

const UNLOCK_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end
`;

const EXTEND_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("PEXPIRE", KEYS[1], ARGV[2])
  else
    return 0
  end
`;

interface DistributedLock {
  key: string;
  ownerToken: string;
  ttlMs: number;
  release: () => Promise<Result<null>>;
  extend: (ttlMs: number) => Promise<Result<null>>;
  startAutoRenewal: (ctx: AbortController, intervalMs: number) => void;
}

async function acquireLock(
  resource: string,
  ttlMs: number,
): Promise<Result<DistributedLock>> {
  const key = `lock:${resource}`;
  const ownerToken = randomUUID();

  try {
    const result = await redis.eval(
      LOCK_SCRIPT,
      1,
      key,
      ownerToken,
      String(ttlMs),
    ) as number;

    if (result === 0) {
      return [new Error("Lock already held"), null];
    }

    const lock: DistributedLock = {
      key,
      ownerToken,
      ttlMs,
      async release(): Promise<Result<null>> {
        try {
          const res = await redis.eval(
            UNLOCK_SCRIPT,
            1,
            lock.key,
            lock.ownerToken,
          ) as number;
          if (res === 0) {
            return [new Error("Lock not owned or already released"), null];
          }
          return [null, null];
        } catch (err) {
          return [err instanceof Error ? err : new Error(String(err)), null];
        }
      },
      async extend(newTtlMs: number): Promise<Result<null>> {
        try {
          const res = await redis.eval(
            EXTEND_SCRIPT,
            1,
            lock.key,
            lock.ownerToken,
            String(newTtlMs),
          ) as number;
          if (res === 0) {
            return [new Error("Lock not owned"), null];
          }
          lock.ttlMs = newTtlMs;
          return [null, null];
        } catch (err) {
          return [err instanceof Error ? err : new Error(String(err)), null];
        }
      },
      startAutoRenewal(ctx: AbortController, intervalMs: number): void {
        const renew = async (): Promise<void> => {
          if (ctx.signal.aborted) return;
          const [err] = await lock.extend(intervalMs * 2);
          if (err != null) return;
          setTimeout(renew, intervalMs).unref();
        };
        setTimeout(renew, intervalMs).unref();
      },
    };

    return [null, lock];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

## PostgreSQL Advisory Locks

### Funciones de Lock

```sql
-- Session-level (persiste hasta release o disconnect)
SELECT pg_advisory_lock(key);           -- Bloquea hasta obtener
SELECT pg_try_advisory_lock(key);       -- No bloquea, retorna true/false
SELECT pg_advisory_unlock(key);         -- Liberar explícitamente

-- Transaction-level (auto-release al commit/rollback)
SELECT pg_advisory_xact_lock(key);      -- En transacción actual
SELECT pg_try_advisory_xact_lock(key);  -- No bloquea

-- Con dos integers (para composite keys)
SELECT pg_advisory_lock(key1, key2);
```

### Generación de Keys

```typescript
import { createHash } from "node:crypto";

// Opción 1: Hash de string
function generateLockKey(resource: string): bigint {
  const hash = createHash("md5").update(resource).digest();
  return hash.readBigUInt64BE(0) & ((1n << 63n) - 1n);
}

// Uso
const key = generateLockKey(`booking:${providerId}:${startTime}`);
await pool.query("SELECT pg_advisory_lock($1)", [key]);

// Opción 2: Dos integers (table_id, row_id pattern)
await pool.query("SELECT pg_advisory_lock($1, $2)", [providerId, serviceId]);

// Opción 3: hashtext built-in
await pool.query("SELECT pg_advisory_lock(hashtext($1))", [resource]);
```

### Implementación en TypeScript

```typescript
import { Pool, PoolClient } from "pg";

interface AdvisoryLock {
  key: bigint;
  held: boolean;
  release: () => Promise<Result<null>>;
}

async function acquireAdvisoryLock(
  pool: Pool,
  resource: string,
): Promise<Result<AdvisoryLock>> {
  const key = generateLockKey(resource);

  try {
    await pool.query("SELECT pg_advisory_lock($1)", [key]);
    const lock: AdvisoryLock = {
      key,
      held: true,
      async release(): Promise<Result<null>> {
        if (!lock.held) return [null, null];
        try {
          await pool.query("SELECT pg_advisory_unlock($1)", [lock.key]);
          lock.held = false;
          return [null, null];
        } catch (err) {
          return [err instanceof Error ? err : new Error(String(err)), null];
        }
      },
    };
    return [null, lock];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}

async function tryAcquireAdvisoryLock(
  pool: Pool,
  resource: string,
): Promise<Result<AdvisoryLock>> {
  const key = generateLockKey(resource);

  try {
    const { rows } = await pool.query(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [key],
    );
    const acquired = rows[0].acquired as boolean;

    if (!acquired) {
      return [new Error("Lock already held"), null];
    }

    const lock: AdvisoryLock = {
      key,
      held: true,
      async release(): Promise<Result<null>> {
        if (!lock.held) return [null, null];
        try {
          await pool.query("SELECT pg_advisory_unlock($1)", [lock.key]);
          lock.held = false;
          return [null, null];
        } catch (err) {
          return [err instanceof Error ? err : new Error(String(err)), null];
        }
      },
    };
    return [null, lock];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}

async function acquireAdvisoryXactLock(
  client: PoolClient,
  resource: string,
): Promise<Result<null>> {
  const key = generateLockKey(resource);
  try {
    await client.query("SELECT pg_advisory_xact_lock($1)", [key]);
    return [null, null];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

### Lock en Transacción (Auto-release)

```typescript
import { Pool } from "pg";

async function createBookingWithAdvisoryLock(
  pool: Pool,
  bookingData: Readonly<{ providerId: string; startTime: string }>,
): Promise<Result<null>> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const resource = `booking:${bookingData.providerId}:${bookingData.startTime}`;
    const [lockErr] = await acquireAdvisoryXactLock(client, resource);
    if (lockErr != null) {
      await client.query("ROLLBACK");
      return [lockErr, null];
    }

    const [availErr, available] = await checkAvailability(client, bookingData);
    if (availErr != null) {
      await client.query("ROLLBACK");
      return [availErr, null];
    }
    if (!available) {
      await client.query("ROLLBACK");
      return [new Error("Time slot not available"), null];
    }

    const [createErr] = await createBookingRecord(client, bookingData);
    if (createErr != null) {
      await client.query("ROLLBACK");
      return [createErr, null];
    }

    await client.query("COMMIT");
    return [null, null];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    return [err instanceof Error ? err : new Error(String(err)), null];
  } finally {
    client.release();
  }
}
```

## Prevención de Double-Booking

### Patrón: Lock + Verificación

```typescript
async function preventDoubleBooking(
  pool: Pool,
  redis: Redis,
  providerId: string,
  startTime: string,
): Promise<Result<null>> {
  const resource = `lock:${providerId}:${startTime.slice(0, 16)}`;

  const [lockErr, lock] = await acquireLock(resource, 300_000);
  if (lockErr != null) {
    return [new Error("Lock failed"), null];
  }

  try {
    const [existsErr, exists] = await checkBookingExists(pool, providerId, startTime);
    if (existsErr != null) {
      return [existsErr, null];
    }
    if (exists) {
      return [new Error("Time slot already booked"), null];
    }

    const [createErr] = await createBooking(pool, providerId, startTime);
    if (createErr != null) {
      return [createErr, null];
    }

    return [null, null];
  } finally {
    await lock.release();
  }
}
```

### Patrón: SELECT FOR UPDATE

```typescript
async function preventDoubleBookingWithRowLock(
  client: PoolClient,
  providerId: string,
  startTime: string,
): Promise<Result<null>> {
  const query = `
    SELECT id FROM availability
    WHERE provider_id = $1
      AND date = $2
    FOR UPDATE NOWAIT
  `;

  try {
    await client.query(query, [providerId, startTime.slice(0, 10)]);
    return [null, null];
  } catch (err) {
    if (isLockFailed(err)) {
      return [new Error("Time slot locked"), null];
    }
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}

function isLockFailed(err: unknown): boolean {
  if (err instanceof Error && "code" in err) {
    return (err as { code: string }).code === "55P03";
  }
  return false;
}
```

## Manejo de Expiración

### Keyspace Notifications (Redis)

```typescript
async function subscribeToLockExpirations(
  redis: Redis,
  signal: AbortSignal,
): Promise<void> {
  const subscriber = redis.duplicate();

  await subscriber.psubscribe("__keyevent@0__:expired");

  subscriber.on("pmessage", (_pattern, _channel, key: string) => {
    if (key.startsWith("lock:")) {
      handleLockExpiration(key);
    }
  });

  signal.addEventListener("abort", () => {
    void subscriber.quit();
  }, { once: true });
}

function handleLockExpiration(lockKey: string): void {
  console.log(`Lock expired: ${lockKey}`);
}
```

### Cleanup de Locks Expirados

```sql
CREATE TABLE booking_locks (
    lock_key VARCHAR(255) PRIMARY KEY,
    owner_token UUID NOT NULL,
    provider_id UUID NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    acquired_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    released_at TIMESTAMPTZ
);

CREATE INDEX idx_locks_expires ON booking_locks(expires_at);
CREATE INDEX idx_locks_released ON booking_locks(released_at) WHERE released_at IS NULL;

-- Cleanup job (correr cada 5 min)
DELETE FROM booking_locks
WHERE expires_at < NOW() - INTERVAL '1 hour'
   OR released_at < NOW() - INTERVAL '24 hours';
```

### Monitoreo de Locks Activos

```typescript
async function getActiveLocks(
  redis: Redis,
  pattern: string,
): Promise<Result<string[]>> {
  try {
    const keys = await redis.keys(pattern);
    const activeLocks: string[] = [];

    for (const key of keys) {
      const ttl = await redis.pttl(key);
      activeLocks.push(`${key} (TTL: ${ttl}ms)`);
    }

    return [null, activeLocks];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), []];
  }
}

// Uso: getActiveLocks(redis, "lock:*")
```

## Errores Comunes

### ❌ No Usar Owner Token

```typescript
// MAL: Cualquiera puede liberar el lock
await redis.del(lockKey);

// BIEN: Verificar ownership con Lua script
await redis.eval(UNLOCK_SCRIPT, 1, lockKey, ownerToken);
```

### ❌ Lock Sin TTL

```typescript
// MAL: Deadlock seguro si cliente muere
await redis.set(lockKey, token, "NX");

// BIEN: Con TTL y auto-release
await redis.set(lockKey, token, "PX", 300_000, "NX");
```

### ❌ No Extender Lock en Operaciones Largas

```typescript
// MAL: Lock expira durante operación
const [_, lock] = await acquireLock(resource, 60_000);
await sleep(120_000); // Lock ya expiró!
// Operación en recurso compartido → RACE CONDITION

// BIEN: Auto-renewal
const ctx = new AbortController();
const [_, lock] = await acquireLock(resource, 60_000);
if (lock != null) {
  lock.startAutoRenewal(ctx, 30_000);
  await sleep(120_000);
  ctx.abort();
  await lock.release();
}
```

### ❌ Usar Redlock Cuando Postgres Es Suficiente

```typescript
// MAL: Complejidad innecesaria
// Si ya usas PostgreSQL y es monolito:
const lock = await redlock.acquire([resource], ttl);

// BIEN: Advisory lock
await pool.query("SELECT pg_advisory_lock($1)", [key]);
```

### ❌ No Manejar Lock Expiration

```typescript
// MAL: Asumir que el lock persiste
const [_, lock] = await acquireLock(resource, 300_000);
await sleep(600_000); // Lock expiró!
// Operación insegura

// BIEN: Verificar y extender
const [_, lock] = await acquireLock(resource, 300_000);
if (lock != null) {
  const ctx = new AbortController();
  lock.startAutoRenewal(ctx, 60_000);
  // ... operación ...
  ctx.abort();
  await lock.release();
}
```

## Checklist Producción

- [ ] Elegir estrategia: Redis Redlock vs PostgreSQL Advisory
- [ ] Owner token único (UUID) para cada lock
- [ ] TTL configurado (5-15 min típico)
- [ ] Lua script para unlock atómico
- [ ] Auto-renewal para operaciones largas
- [ ] Keyspace notifications para monitoreo
- [ ] Cleanup de locks expirados
- [ ] Logging de adquisición/liberación
- [ ] Métricas de lock contention
- [ ] Alertas de locks retenidos > threshold
- [ ] Runbook para force-unlock manual
