# Redis con TypeScript y Windmill - Best Practices

## Distributed Lock para Booking System

### Patrón SET con NX+PX y Owner Token

```typescript
import Redis from "ioredis";
import { randomUUID } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL);

type Result<T> = [Error | null, T | null];

// Adquirir lock
async function acquireLock(
  providerId: string,
  startTime: string,
): Promise<Result<string>> {
  const lockKey = `lock:${providerId}:${startTime}`;
  const ownerToken = randomUUID();

  const acquired = await redis.set(lockKey, ownerToken, "PX", 300_000, "NX");

  if (acquired !== "OK") {
    return [new Error("Lock already held"), null];
  }

  return [null, ownerToken];
}

// Liberar lock (con verificación de ownership)
async function releaseLock(
  lockKey: string,
  ownerToken: string,
): Promise<Result<null>> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  try {
    const result = await redis.eval(script, 1, lockKey, ownerToken) as number;
    if (result === 0) {
      return [new Error("Lock not owned or already released"), null];
    }
    return [null, null];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

### Lua Script para Lock Atómico

```lua
-- acquire.lua
-- KEYS[1]: lock key
-- ARGV[1]: owner token (UUID)
-- ARGV[2]: TTL en ms

if redis.call("EXISTS", KEYS[1]) == 1 then
    return 0 -- Lock ya existe
end

redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2])
return 1 -- Lock adquirido
```

```lua
-- release.lua
-- KEYS[1]: lock key
-- ARGV[1]: owner token

if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else
    return 0 -- No es el owner
end
```

### Uso con ioredis

```typescript
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

const ACQUIRE_SCRIPT = `
  if redis.call("EXISTS", KEYS[1]) == 1 then return 0 end
  redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2])
  return 1
`;

async function acquireLockWithScript(
  key: string,
  token: string,
  ttlMs: number,
): Promise<Result<null>> {
  try {
    const result = await redis.eval(
      ACQUIRE_SCRIPT,
      1,
      key,
      token,
      String(ttlMs),
    ) as number;

    if (result === 0) {
      return [new Error("Lock not available"), null];
    }
    return [null, null];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

### Patrones de Lock (12 patrones esenciales)

| Patrón | Cuándo Usar | Implementación |
|--------|-------------|----------------|
| **Simple SETNX** | Single instance Redis | `SETNX key token` + `EXPIRE` |
| **SET con NX+PX** | Producción (atómico) | `SET key token NX PX ttl` |
| **Lock con Owner** | Prevenir mis-release | Guardar UUID, verificar al liberar |
| **Lock con RedLock** | Multi-instance Redis | 5 instancias, quórum 3/5 |
| **Lock con Fencing Token** | Alta seguridad | Increment counter + token |
| **Lock con Extension** | Operaciones largas | Extender TTL si owner coincide |

### Errores Comunes en Distributed Locks

```typescript
// ❌ MAL: No verificar ownership al liberar
async function releaseLockBad(key: string): Promise<void> {
  await redis.del(key); // Puede borrar lock de otro cliente!
}

// ✅ BIEN: Verificar con Lua script
async function releaseLockSafe(key: string, token: string): Promise<void> {
  const script = `if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`;
  await redis.eval(script, 1, key, token);
}

// ❌ MAL: Lock sin TTL (deadlock seguro)
await redis.set(key, token, "NX"); // Sin expiración!

// ✅ BIEN: Siempre con TTL
await redis.set(key, token, "PX", 300_000, "NX"); // Auto-release

// ❌ MAL: No reintentar adquisición
if (acquired !== "OK") {
  return [new Error("Lock failed"), null]; // Sin retry
}

// ✅ BIEN: Retry con backoff
for (let attempt = 0; attempt < 3; attempt++) {
  const acquired = await redis.set(key, token, "PX", 300_000, "NX");
  if (acquired === "OK") break;
  await new Promise((resolve) => setTimeout(resolve, attempt * attempt * 100));
}
```

## Configuración de Conexión (ioredis)

### Pool Sizing para Producción

```typescript
import Redis from "ioredis";

const redis = new Redis({
  host: "localhost",
  port: 6379,

  // Connection pool
  maxRetriesPerRequest: 3,
  retryStrategy(times: number): number | null {
    if (times > 3) return null;
    return Math.min(times * 100, 3000);
  },

  // Timeouts críticos
  connectTimeout: 5_000,
  commandTimeout: 3_000,

  // Reconnect
  reconnectOnError(err: Error): boolean {
    return err.message.includes("READONLY");
  },

  // Sentinel / Cluster (si aplica)
  // sentinelGroup: 'mymaster',
  // enableAutoPipelining: true,
});

// Health check
const [pingErr] = await checkRedisHealth(redis);
if (pingErr != null) {
  console.error("Redis connection failed:", pingErr.message);
}
```

### Parámetros de Pool

| Parámetro | Valor Recomendado | Propósito |
|-----------|-------------------|-----------|
| `maxRetriesPerRequest` | 3 | Reintentos por comando |
| `connectTimeout` | 5_000 | Timeout de conexión |
| `commandTimeout` | 3_000 | Timeout de lectura/escritura |
| `retryStrategy` | backoff exponencial | Reconexión automática |

### Timeouts según Escenario

| Escenario | connectTimeout | commandTimeout | Cuándo |
|-----------|----------------|----------------|--------|
| **Default** | 5s | 3s | Producción normal |
| **Alta latencia** | 10s | 5s | Red lenta |
| **Operaciones largas** | 5s | 10s | Scripts pesados |
| **Load balancer** | 5s | 3s | Con health checks |

## Persistencia AOF

### Configuración Recomendada

```conf
# redis.conf

# Habilitar AOF
appendonly yes

# Nombre del archivo
appendfilename "appendonly.aof"

# Política de fsync (BALANCE recomendado)
appendfsync everysec

# No hacer fsync durante rewrite (mejor performance)
no-appendfsync-on-rewrite yes

# Rewrite automático
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# Redis 7.0+: Formato RDB preamble (más rápido)
aof-use-rdb-preamble yes
```

### Trade-off: appendfsync

| Política | Durabilidad | Performance | Data Loss | Cuándo Usar |
|----------|-------------|-------------|-----------|-------------|
| `always` | Máxima | Lenta | 0 writes | Crítico (pagos) |
| `everysec` | **Balance** | **Rápida** | ~1s | **Producción (default)** |
| `no` | Baja | Muy rápida | Varios segundos | Cache, datos efímeros |

### Monitoreo de AOF

```bash
# Verificar tamaño AOF
redis-cli INFO persistence | grep aof

# Trigger manual de rewrite
redis-cli BGREWRITEAOF

# Monitorear fsync latency
redis-cli --intrinsic-latency 100

# Alertas recomendadas
# - aof_current_size > 1GB
# - aof_rewrite_in_progress == 1 por > 5 min
# - last_aof_rewrite_time_sec > 60s
```

## Cache de Disponibilidad

### Patrón Cache-Aside con TTL

```typescript
interface Slot {
  startTime: string;
  endTime: string;
  available: boolean;
}

async function getAvailability(
  redis: Redis,
  providerId: string,
  date: string,
): Promise<Result<Slot[]>> {
  const key = `availability:${providerId}:${date}`;

  // Intentar cache
  try {
    const cached = await redis.get(key);
    if (cached != null) {
      const slots = JSON.parse(cached) as Slot[];
      return [null, slots];
    }
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }

  // Cache miss: leer de DB
  const [dbErr, slots] = await fetchAvailabilityFromDB(providerId, date);
  if (dbErr != null) {
    return [dbErr, null];
  }

  // Escribir en cache con TTL
  const data = JSON.stringify(slots);
  await redis.set(key, data, "EX", 300); // TTL 5 min

  return [null, slots];
}
```

### Estrategias de Invalidación

| Estrategia | TTL | Cuándo Usar |
|------------|-----|-------------|
| **TTL puro** | 5 min | Disponibilidad cambia poco |
| **TTL + evento** | 5 min + invalidar al crear booking | Alta concurrencia |
| **Key versioning** | Sin TTL, versión en key | Cambios masivos |
| **Pub/Sub invalidation** | TTL largo + broadcast | Multi-servicio |

### Invalidación con Pub/Sub

```typescript
async function invalidateAvailabilityCache(
  redis: Redis,
  providerId: string,
  date: string,
): Promise<Result<null>> {
  const key = `availability:${providerId}:${date}`;
  try {
    await redis.del(key);
    return [null, null];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}

// Suscribirse a invalidaciones
async function subscribeToInvalidations(
  redis: Redis,
  signal: AbortSignal,
): Promise<void> {
  const subscriber = redis.duplicate();

  await subscriber.subscribe("availability:invalidation");

  subscriber.on("message", (_channel, payload: string) => {
    const data = JSON.parse(payload) as { providerId: string; date: string };
    const key = `availability:${data.providerId}:${data.date}`;
    void redis.del(key);
  });

  signal.addEventListener("abort", () => {
    void subscriber.quit();
  }, { once: true });
}
```

## Sesiones de Usuario

### Estructura de Sesión

```typescript
interface Session {
  userId: string;
  chatId: string;
  createdAt: string;
  expiresAt: string;
}

async function createSession(
  redis: Redis,
  session: Session,
): Promise<Result<null>> {
  const key = `session:${session.userId}`;
  const data = JSON.stringify(session);
  const ttlSec = 1800; // 30 min

  try {
    await redis.set(key, data, "EX", ttlSec);
    return [null, null];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}

async function getSession(
  redis: Redis,
  userId: string,
): Promise<Result<Session | null>> {
  const key = `session:${userId}`;

  try {
    const data = await redis.get(key);
    if (data == null) {
      return [null, null];
    }

    const session = JSON.parse(data) as Session;
    return [null, session];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}

async function touchSession(
  redis: Redis,
  userId: string,
): Promise<Result<null>> {
  const key = `session:${userId}`;
  try {
    await redis.expire(key, 1800);
    return [null, null];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

## Windmill - Resource Types

### Uso de RT.Redis

```typescript
import * as wmill from "windmill-client";
import Redis from "ioredis";

export async function main(redisResource: RT.Redis): Promise<Result<Readonly<Record<string, unknown>>>> {
  const redisUrl = await wmill.getResource(redisResource);

  const redis = new Redis(redisUrl);

  try {
    await redis.set("key", "value");
    return [null, { ok: true }];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  } finally {
    redis.quit();
  }
}
```

### Configuración en Windmill

1. Crear resource tipo `redis` en UI
2. Path: `f/resources/redis-main`
3. Campos: url, password (opcional), tls (opcional)
4. Referenciar: `main(redis: RT.Redis)`

## Lua Scripts Avanzados

### Patrón: Lock con Auto-Extend

```lua
-- lock_with_heartbeat.lua
-- KEYS[1]: lock key
-- ARGV[1]: owner token
-- ARGV[2]: TTL en ms

local current = redis.call("GET", KEYS[1])
if current == ARGV[1] then
    -- Owner válido: extender TTL
    redis.call("PEXPIRE", KEYS[1], ARGV[2])
    return 1
elseif current == false then
    -- Lock no existe: adquirir
    redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2])
    return 1
else
    -- Lock de otro owner
    return 0
end
```

### Patrón: Rate Limiting con Sliding Window

```lua
-- rate_limit.lua
-- KEYS[1]: rate limit key
-- ARGV[1]: window size en ms
-- ARGV[2]: max requests
-- ARGV[3]: timestamp actual

local window = tonumber(ARGV[1])
local max = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

-- Limpiar ventana vieja
redis.call("ZREMRANGEBYSCORE", KEYS[1], 0, now - window)

-- Contar requests en ventana
local count = redis.call("ZCARD", KEYS[1])

if count >= max then
    return 0 -- Rate limit excedido
end

-- Agregar request actual
redis.call("ZADD", KEYS[1], now, now)
redis.call("PEXPIRE", KEYS[1], window)

return 1 -- Request permitido
```

### Patrón: Atomic Decrement con Límite

```lua
-- atomic_decrement_limit.lua
-- KEYS[1]: inventory key
-- ARGV[1]: cantidad a decrementar
-- ARGV[2]: límite mínimo (0 = no permitir negativos)

local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local decrement = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])

if current - decrement >= limit then
    redis.call("DECRBY", KEYS[1], decrement)
    return current - decrement
else
    return -1 -- Insuficiente
end
```

## Errores Comunes

### ❌ No Usar Owner Token

```typescript
// MAL: Cualquiera puede liberar el lock
await redis.del(lockKey);

// BIEN: Verificar ownership
const script = `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`;
await redis.eval(script, 1, lockKey, ownerToken);
```

### ❌ Lock Sin TTL

```typescript
// MAL: Deadlock garantizado si cliente muere
await redis.set(key, token, "NX");

// BIEN: Auto-release
await redis.set(key, token, "PX", 300_000, "NX");
```

### ❌ No Manejar BUSY Errors de Lua

```typescript
// MAL: Sin retry para BUSY error
const result = await redis.eval(script, 1, key, token);
if (result == null) {
  return; // Puede ser BUSY, debería reintentar
}

// BIEN: Retry con backoff
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    const result = await redis.eval(script, 1, key, token);
    if (result != null) break;
  } catch (err) {
    if (err instanceof Error && err.message.includes("BUSY")) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
      continue;
    }
    throw err;
  }
}
```

### ❌ TTL de Cache Muy Largo

```typescript
// MAL: Datos stale por horas
await redis.set(key, data, "EX", 3600);

// BIEN: TTL corto + invalidación
await redis.set(key, data, "EX", 300);
// Invalidar al crear booking
```

## Métricas a Monitorear

| Métrica | Alerta Si | Acción |
|---------|-----------|--------|
| Conexiones activas | > 80% de max | Aumentar pool |
| Latencia p99 | > 10ms | Verificar red/Redis |
| Lock acquisition failures | > 5% | Revisar concurrencia |
| Cache hit rate | < 80% | Ajustar TTL/estrategia |
| AOF size | > 1GB | Trigger rewrite |
| Keys evicted | > 100/min | Aumentar memory |

## Checklist Producción

- [ ] Distributed lock con owner token + TTL
- [ ] Lua scripts para operaciones atómicas
- [ ] Pool sizing configurado
- [ ] Timeouts configurados
- [ ] AOF enabled con appendfsync everysec
- [ ] Cache con TTL corto (5 min) + invalidación
- [ ] Health check con `redis.ping()`
- [ ] Manejo de errores BUSY en Lua scripts
- [ ] Monitoreo de latencia p99
- [ ] Plan de capacidad (memory, conexiones)
