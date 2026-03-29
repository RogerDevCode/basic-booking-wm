# Redis con Go y Windmill - Best Practices

## Distributed Lock para Booking System

### Patrón SETNX con Owner Token

```go
// Adquirir lock
func acquireLock(ctx context.Context, rdb *redis.Client, providerID int, startTime time.Time) (string, error) {
    lockKey := fmt.Sprintf("lock:%d:%s", providerID, startTime.Format("2006-01-02-15:04"))
    ownerToken := uuid.New().String()
    
    // SETNX con TTL atómico
    acquired, err := rdb.SetNX(ctx, lockKey, ownerToken, 5*time.Minute).Result()
    if err != nil {
        return "", err
    }
    if !acquired {
        return "", ErrLockAlreadyHeld
    }
    
    return ownerToken, nil
}

// Liberar lock (con verificación de ownership)
func releaseLock(ctx context.Context, rdb *redis.Client, lockKey, ownerToken string) error {
    // Lua script para verificar y eliminar atómicamente
    script := redis.NewScript(`
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
    `)
    
    result, err := script.Run(ctx, rdb, []string{lockKey}, ownerToken).Int()
    if err != nil {
        return err
    }
    if result == 0 {
        return ErrLockNotOwned // Previene liberar lock ajeno
    }
    return nil
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

### Uso en Go con go-redis

```go
import "github.com/redis/go-redis/v9"

var acquireScript = redis.NewScript(`
    if redis.call("EXISTS", KEYS[1]) == 1 then return 0 end
    redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2])
    return 1
`)

func acquireLockWithScript(ctx context.Context, rdb *redis.Client, key, token string, ttl time.Duration) error {
    result, err := acquireScript.Run(ctx, rdb, []string{key}, token, ttl.Milliseconds()).Int()
    if err != nil {
        return err
    }
    if result == 0 {
        return ErrLockNotAvailable
    }
    return nil
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

```go
// ❌ MAL: No verificar ownership al liberar
func releaseLockBad(rdb *redis.Client, key string) {
    rdb.Del(key) // Puede borrar lock de otro cliente!
}

// ✅ BIEN: Verificar con Lua script
func releaseLockSafe(ctx context.Context, rdb *redis.Client, key, token string) {
    script := redis.NewScript(`if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`)
    script.Run(ctx, rdb, []string{key}, token)
}

// ❌ MAL: Lock sin TTL (deadlock seguro)
rdb.SetNX(ctx, key, token, 0) // Sin expiración!

// ✅ BIEN: Siempre con TTL
rdb.SetNX(ctx, key, token, 5*time.Minute) // Auto-release

// ❌ MAL: No reintentar adquisición
if !acquired {
    return ErrLockFailed // Sin retry
}

// ✅ BIEN: Retry con backoff
for i := 0; i < 3; i++ {
    if acquired {
        break
    }
    time.Sleep(time.Duration(i*i) * 100 * time.Millisecond)
}
```

## Configuración de Conexión (go-redis)

### Pool Sizing para Producción

```go
import "github.com/redis/go-redis/v9"

rdb := redis.NewClient(&redis.Options{
    Addr: "localhost:6379",
    
    // Connection pool
    PoolSize:     25,              // Conexiones máximas
    MinIdleConns: 10,              // Conexiones idle mínimas
    MaxConnAge:   30 * time.Minute, // Rotar conexiones viejas
    
    // Timeouts críticos
    DialTimeout:  5 * time.Second,  // Timeout de conexión
    ReadTimeout:  3 * time.Second,  // Timeout de lectura
    WriteTimeout: 3 * time.Second,  // Timeout de escritura
    
    // Pool timeout
    PoolTimeout:  4 * time.Second,  // ReadTimeout + 1s
    
    // Idle connections
    ConnMaxIdleTime: 10 * time.Minute, // Cerrar idle después de
})

// Health check
if err := rdb.Ping(ctx).Err(); err != nil {
    log.Fatalf("Redis connection failed: %v", err)
}
```

### Parámetros de Pool

| Parámetro | Valor Recomendado | Propósito |
|-----------|-------------------|-----------|
| `PoolSize` | 25 (ajustar según carga) | Máximo conexiones simultáneas |
| `MinIdleConns` | 10 (40% de PoolSize) | Conexiones warm listas |
| `MaxConnAge` | 30 min | Rotar conexiones viejas |
| `PoolTimeout` | ReadTimeout + 1s | Evitar bloqueo al obtener conexión |
| `ConnMaxIdleTime` | 10 min | Cerrar conexiones inactivas |

### Timeouts según Escenario

| Escenario | DialTimeout | ReadTimeout | PoolTimeout |
|-----------|-------------|-------------|-------------|
| **Default** | 5s | 3s | 4s |
| **Alta latencia** | 10s | 5s | 6s |
| **Operaciones largas** | 5s | 10s | 11s |
| **Load balancer** | 5s | 3s | 4s + 2s jitter |

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
auto-aof-rewrite-percentage 100  # Trigger cuando AOF es 100% más grande
auto-aof-rewrite-min-size 64mb   # Tamaño mínimo para rewrite

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

```go
// Leer disponibilidad (cache-aside)
func getAvailability(ctx context.Context, rdb *redis.Client, providerID int, date time.Time) ([]Slot, error) {
    key := fmt.Sprintf("availability:%d:%s", providerID, date.Format("2006-01-02"))
    
    // Intentar cache
    cached, err := rdb.Get(ctx, key).Result()
    if err == nil {
        var slots []Slot
        json.Unmarshal([]byte(cached), &slots)
        return slots, nil
    }
    if err != redis.Nil {
        return nil, err
    }
    
    // Cache miss: leer de DB
    slots, err := fetchAvailabilityFromDB(ctx, providerID, date)
    if err != nil {
        return nil, err
    }
    
    // Escribir en cache con TTL
    data, _ := json.Marshal(slots)
    rdb.Set(ctx, key, data, 5*time.Minute) // TTL corto para disponibilidad
    
    return slots, nil
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

```go
// Publicar evento de invalidación
func invalidateAvailabilityCache(ctx context.Context, rdb *redis.Client, providerID int, date time.Time) error {
    key := fmt.Sprintf("availability:%d:%s", providerID, date.Format("2006-01-02"))
    return rdb.Del(ctx, key).Err()
}

// Suscribirse a invalidaciones
func subscribeToInvalidations(ctx context.Context, rdb *redis.Client) {
    pubsub := rdb.Subscribe(ctx, "availability:invalidation")
    
    for msg := range pubsub.Channel() {
        var payload struct {
            ProviderID int
            Date       string
        }
        json.Unmarshal([]byte(msg.Payload), &payload)
        
        key := fmt.Sprintf("availability:%d:%s", payload.ProviderID, payload.Date)
        rdb.Del(ctx, key)
    }
}
```

## Sesiones de Usuario

### Estructura de Sesión

```go
type Session struct {
    UserID    string    `json:"user_id"`
    ChatID    string    `json:"chat_id"`
    CreatedAt time.Time `json:"created_at"`
    ExpiresAt time.Time `json:"expires_at"`
}

// Crear sesión
func createSession(ctx context.Context, rdb *redis.Client, session Session) error {
    key := fmt.Sprintf("session:%s", session.UserID)
    data, _ := json.Marshal(session)
    
    return rdb.Set(ctx, key, data, 24*time.Hour).Err()
}

// Leer sesión
func getSession(ctx context.Context, rdb *redis.Client, userID string) (*Session, error) {
    key := fmt.Sprintf("session:%s", userID)
    
    data, err := rdb.Get(ctx, key).Result()
    if err != nil {
        return nil, err
    }
    
    var session Session
    if err := json.Unmarshal([]byte(data), &session); err != nil {
        return nil, err
    }
    
    return &session, nil
}

// Extender TTL (actividad reciente)
func touchSession(ctx context.Context, rdb *redis.Client, userID string) error {
    key := fmt.Sprintf("session:%s", userID)
    return rdb.Expire(ctx, key, 24*time.Hour).Err()
}
```

## Windmill - Resource Types

### Uso de RT.Redis

```typescript
import * as wmill from "windmill-client";
import { createClient } from 'redis';

export async function main(redis: RT.Redis) {
    // Obtener connection string del resource
    const redisUrl = await wmill.getResource(redis);
    // redisUrl: "redis://user:pass@host:6379/0"
    
    const client = createClient({ url: redisUrl });
    await client.connect();
    
    try {
        await client.set('key', 'value');
    } finally {
        await client.quit();
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

```go
// MAL: Cualquiera puede liberar el lock
rdb.Del(ctx, lockKey)

// BIEN: Verificar ownership
script := redis.NewScript(`if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`)
script.Run(ctx, rdb, []string{lockKey}, ownerToken)
```

### ❌ Lock Sin TTL

```go
// MAL: Deadlock garantizado si cliente muere
rdb.SetNX(ctx, key, token, 0)

// BIEN: Auto-release
rdb.SetNX(ctx, key, token, 5*time.Minute)
```

### ❌ No Manejar BUSY Errors de Lua

```go
// MAL: Sin retry para BUSY error
result, err := script.Run(ctx, rdb, keys, args...).Result()
if err != nil {
    return err // Puede ser BUSY, debería reintentar
}

// BIEN: Retry con backoff
for i := 0; i < 3; i++ {
    result, err := script.Run(ctx, rdb, keys, args...).Result()
    if err == nil {
        return result, nil
    }
    if strings.Contains(err.Error(), "BUSY") {
        time.Sleep(time.Duration(i) * 100 * time.Millisecond)
        continue
    }
    return nil, err
}
```

### ❌ TTL de Cache Muy Largo

```go
// MAL: Datos stale por horas
rdb.Set(ctx, key, data, 1*time.Hour)

// BIEN: TTL corto + invalidación
rdb.Set(ctx, key, data, 5*time.Minute)
// Invalidar al crear booking
```

## Métricas a Monitorear

| Métrica | Alerta Si | Acción |
|---------|-----------|--------|
| Conexiones activas | > 80% de PoolSize | Aumentar pool |
| Latencia p99 | > 10ms | Verificar red/Redis |
| Lock acquisition failures | > 5% | Revisar concurrencia |
| Cache hit rate | < 80% | Ajustar TTL/estrategia |
| AOF size | > 1GB | Trigger rewrite |
| Keys evicted | > 100/min | Aumentar memory |

## Checklist Producción

- [ ] Distributed lock con owner token + TTL
- [ ] Lua scripts para operaciones atómicas
- [ ] Pool sizing configurado (25/10/30min)
- [ ] Timeouts configurados (5s/3s/4s)
- [ ] AOF enabled con appendfsync everysec
- [ ] Cache con TTL corto (5 min) + invalidación
- [ ] Health check con redis.Ping()
- [ ] Manejo de errores BUSY en Lua scripts
- [ ] Monitoreo de latencia p99
- [ ] Plan de capacidad (memory, conexiones)
