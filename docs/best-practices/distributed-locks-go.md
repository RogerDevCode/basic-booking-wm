# Distributed Locks en Go con Redis y PostgreSQL - Best Practices

## Redlock vs Advisory Locks

### Comparación

| Característica | Redis Redlock | PostgreSQL Advisory Locks |
|----------------|---------------|---------------------------|
| **Infraestructura** | Requiere Redis (5 instancias para Redlock) | Usa PostgreSQL existente |
| **Complejidad** | Alta (quórum, clock drift) | Baja (funciones built-in) |
| **Performance** | Muy alta (in-memory) | Media (database lock) |
| **TTL Automático** | ✅ Sí (con SET PX) | ❌ No (manual o transaction-level) |
| **Auto-release** | ✅ Sí (key expiry) | ⚠️ Solo session disconnect |
| **Lock Stale** | Riesgo si clock drift | No (centralizado) |
| **Recomendado** | Alta concurrencia, microservicios | Monolito, ya usa Postgres |

### Cuándo Usar Cada Uno

```go
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

### Algoritmo Redlock (5 instancias)

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

### Implementación con go-redsync

```go
package inner

import (
    "context"
    "fmt"
    "time"
    
    "github.com/go-redsync/redsync/v4"
    "github.com/go-redsync/redsync/v4/redis/redigo"
    "github.com/gomodule/redigo/redis"
)

// Crear Redsync con múltiples pools de Redis
func createRedsync(pools []redis.Pool) *redsync.Redsync {
    // Crear pools para cada instancia Redis
    var poolConn []redigo.Pool
    for _, pool := range pools {
        poolConn = append(poolConn, redigo.NewPool(&pool))
    }
    
    // Inicializar Redsync
    return redsync.New(poolConn...)
}

// Adquirir lock distribuido
func acquireDistributedLock(rs *redsync.Redsync, resource string, ttl time.Duration) (*redsync.Mutex, error) {
    // Crear mutex
    mutex := rs.NewMutex(resource,
        redsync.WithExpiry(ttl),
        redsync.WithTries(3),
        redsync.WithDelay(200*time.Millisecond),
    )
    
    // Intentar adquirir
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    
    if err := mutex.LockContext(ctx); err != nil {
        return nil, fmt.Errorf("failed to acquire lock: %w", err)
    }
    
    return mutex, nil
}

// Liberar lock
func releaseDistributedLock(mutex *redsync.Mutex) error {
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    
    ok, err := mutex.UnlockContext(ctx)
    if err != nil {
        return fmt.Errorf("failed to release lock: %w", err)
    }
    if !ok {
        return fmt.Errorf("lock was already released or expired")
    }
    
    return nil
}

// Uso en script Windmill
func main(
    ctx context.Context,
    providerID int,
    startTime string,
    operation string,
) (map[string]any, error) {
    // Conectar a 5 instancias Redis
    pools := createRedisPools() // Implementar según tu infra
    rs := createRedsync(pools)
    
    // Key única para el time slot
    resource := fmt.Sprintf("lock:%d:%s", providerID, startTime)
    
    // Adquirir lock (5 minutos)
    mutex, err := acquireDistributedLock(rs, resource, 5*time.Minute)
    if err != nil {
        return map[string]any{
            "acquired": false,
            "error":    err.Error(),
        }, nil
    }
    
    // Asegurar release
    defer func() {
        releaseDistributedLock(mutex)
    }()
    
    // Ejecutar operación crítica
    result, err := executeBookingOperation(ctx, providerID, startTime, operation)
    if err != nil {
        return nil, err
    }
    
    return map[string]any{
        "acquired": true,
        "result":   result,
    }, nil
}
```

### Implementación Manual con Lua Script

```go
import (
    "github.com/redis/go-redis/v9"
    "github.com/google/uuid"
)

// Scripts Lua para operaciones atómicas
var (
    lockScript = redis.NewScript(`
        if redis.call("SET", KEYS[1], ARGV[1], "NX", "PX", ARGV[2]) then
            return 1
        else
            return 0
        end
    `)
    
    unlockScript = redis.NewScript(`
        if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("DEL", KEYS[1])
        else
            return 0
        end
    `)
    
    extendScript = redis.NewScript(`
        if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("PEXPIRE", KEYS[1], ARGV[2])
        else
            return 0
        end
    `)
)

type DistributedLock struct {
    rdb      *redis.Client
    key      string
    ownerToken string
    ttl      time.Duration
}

// Adquirir lock
func acquireLock(ctx context.Context, rdb *redis.Client, resource string, ttl time.Duration) (*DistributedLock, error) {
    key := fmt.Sprintf("lock:%s", resource)
    ownerToken := uuid.New().String()
    
    // Intentar adquirir
    result, err := lockScript.Run(ctx, rdb, []string{key}, ownerToken, ttl.Milliseconds()).Int()
    if err != nil {
        return nil, err
    }
    if result == 0 {
        return nil, ErrLockAlreadyHeld
    }
    
    return &DistributedLock{
        rdb:        rdb,
        key:        key,
        ownerToken: ownerToken,
        ttl:        ttl,
    }, nil
}

// Liberar lock
func (dl *DistributedLock) Release(ctx context.Context) error {
    result, err := unlockScript.Run(ctx, dl.rdb, []string{dl.key}, dl.ownerToken).Int()
    if err != nil {
        return err
    }
    if result == 0 {
        return ErrLockNotOwned // Intentó borrar lock ajeno
    }
    return nil
}

// Extender TTL (para operaciones largas)
func (dl *DistributedLock) Extend(ctx context.Context, ttl time.Duration) error {
    result, err := extendScript.Run(ctx, dl.rdb, []string{dl.key}, dl.ownerToken, ttl.Milliseconds()).Int()
    if err != nil {
        return err
    }
    if result == 0 {
        return ErrLockNotOwned
    }
    dl.ttl = ttl
    return nil
}

// Auto-renewal goroutine
func (dl *DistributedLock) StartAutoRenewal(ctx context.Context, interval time.Duration) {
    ticker := time.NewTicker(interval)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            // Extender al doble del intervalo
            newTTL := interval * 2
            if err := dl.Extend(ctx, newTTL); err != nil {
                return // Lock perdido o error
            }
        }
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

```go
import (
    "crypto/md5"
    "encoding/binary"
    "fmt"
)

// Opción 1: Hash de string
func generateLockKey(resource string) int64 {
    hash := md5.Sum([]byte(resource))
    return int64(binary.BigEndian.Uint64(hash[:8]))
}

// Uso
key := generateLockKey(fmt.Sprintf("booking:%d:%s", providerID, startTime))
_, err := db.Exec("SELECT pg_advisory_lock($1)", key)

// Opción 2: Dos integers (table_id, row_id pattern)
_, err := db.Exec("SELECT pg_advisory_lock($1, $2)", providerID, serviceID)

// Opción 3: hashtext built-in
_, err := db.Exec("SELECT pg_advisory_lock(hashtext($1))", resource)
```

### Implementación en Go

```go
package inner

import (
    "context"
    "database/sql"
    "fmt"
)

// Advisory Lock en PostgreSQL
type AdvisoryLock struct {
    db    *sql.DB
    key   int64
    held  bool
}

// Adquirir lock (bloqueante)
func acquireAdvisoryLock(ctx context.Context, db *sql.DB, resource string) (*AdvisoryLock, error) {
    key := generateLockKey(resource)
    
    // Intentar adquirir
    _, err := db.ExecContext(ctx, "SELECT pg_advisory_lock($1)", key)
    if err != nil {
        return nil, err
    }
    
    return &AdvisoryLock{
        db:   db,
        key:  key,
        held: true,
    }, nil
}

// Intentar adquirir (no bloqueante)
func tryAcquireAdvisoryLock(ctx context.Context, db *sql.DB, resource string) (*AdvisoryLock, error) {
    key := generateLockKey(resource)
    
    var acquired bool
    err := db.QueryRowContext(ctx, "SELECT pg_try_advisory_lock($1)", key).Scan(&acquired)
    if err != nil {
        return nil, err
    }
    if !acquired {
        return nil, ErrLockAlreadyHeld
    }
    
    return &AdvisoryLock{
        db:   db,
        key:  key,
        held: true,
    }, nil
}

// Liberar lock
func (al *AdvisoryLock) Release(ctx context.Context) error {
    if !al.held {
        return nil
    }
    
    _, err := al.db.ExecContext(ctx, "SELECT pg_advisory_unlock($1)", al.key)
    if err != nil {
        return err
    }
    
    al.held = false
    return nil
}

// Uso en transacción (auto-release)
func acquireAdvisoryXactLock(ctx context.Context, tx *sql.Tx, resource string) error {
    key := generateLockKey(resource)
    _, err := tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock($1)", key)
    return err
}

// Uso en script Windmill
func main(ctx context.Context, providerID int, startTime string) (map[string]any, error) {
    db := getDatabaseConnection()
    
    resource := fmt.Sprintf("booking:%d:%s", providerID, startTime)
    
    // Adquirir lock
    lock, err := acquireAdvisoryLock(ctx, db, resource)
    if err != nil {
        return map[string]any{
            "acquired": false,
            "error":    err.Error(),
        }, nil
    }
    
    // Asegurar release
    defer lock.Release(ctx)
    
    // Ejecutar operación crítica
    result, err := executeBookingOperation(ctx, providerID, startTime)
    if err != nil {
        return nil, err
    }
    
    return map[string]any{
        "acquired": true,
        "result":   result,
    }, nil
}
```

### Lock en Transacción (Auto-release)

```go
func createBookingWithAdvisoryLock(
    ctx context.Context,
    db *sql.DB,
    bookingData BookingData,
) error {
    // Iniciar transacción
    tx, err := db.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer tx.Rollback()
    
    // Adquirir lock (auto-release al commit/rollback)
    resource := fmt.Sprintf("booking:%d:%s", bookingData.ProviderID, bookingData.StartTime)
    if err := acquireAdvisoryXactLock(ctx, tx, resource); err != nil {
        return ErrLockFailed
    }
    
    // Verificar disponibilidad
    available, err := checkAvailability(ctx, tx, bookingData)
    if err != nil {
        return err
    }
    if !available {
        return ErrTimeSlotNotAvailable
    }
    
    // Crear booking
    if err := createBookingRecord(ctx, tx, bookingData); err != nil {
        return err
    }
    
    // Commit libera lock automáticamente
    return tx.Commit()
}
```

## Prevención de Double-Booking

### Patrón: Lock + Verificación

```go
func preventDoubleBooking(
    ctx context.Context,
    db *sql.DB,
    rdb *redis.Client,
    providerID int,
    startTime time.Time,
) error {
    resource := fmt.Sprintf("lock:%d:%s", providerID, startTime.Format("2006-01-02-15:04"))
    
    // 1. Adquirir lock distribuido
    lock, err := acquireLock(ctx, rdb, resource, 5*time.Minute)
    if err != nil {
        return ErrLockFailed
    }
    defer lock.Release(ctx)
    
    // 2. Verificar disponibilidad (dentro del lock)
    exists, err := checkBookingExists(ctx, db, providerID, startTime)
    if err != nil {
        return err
    }
    if exists {
        return ErrTimeSlotAlreadyBooked
    }
    
    // 3. Crear booking (protegido por lock)
    if err := createBooking(ctx, db, providerID, startTime); err != nil {
        return err
    }
    
    return nil
}
```

### Patrón: SELECT FOR UPDATE

```go
func preventDoubleBookingWithRowLock(
    ctx context.Context,
    tx *sql.Tx,
    providerID int,
    startTime time.Time,
) error {
    // Lockear fila de availability
    query := `
        SELECT id FROM availability
        WHERE provider_id = $1
          AND date = $2
        FOR UPDATE NOWAIT
    `
    
    _, err := tx.ExecContext(ctx, query, providerID, startTime.Truncate(24*time.Hour))
    if err != nil {
        if isLockFailed(err) {
            return ErrTimeSlotLocked
        }
        return err
    }
    
    // Ahora podemos modificar availability con seguridad
    return nil
}

func isLockFailed(err error) bool {
    // PostgreSQL error code 55P03 = lock_not_available
    var pgErr *pq.Error
    if errors.As(err, &pgErr) {
        return pgErr.Code == "55P03"
    }
    return false
}
```

## Manejo de Expiración

### Keyspace Notifications (Redis)

```go
// Configurar Redis (una vez, en startup)
// redis-cli CONFIG SET notify-keyspace-events Ex

// Suscribirse a eventos de expiración
func subscribeToLockExpirations(ctx context.Context, rdb *redis.Client) {
    pubsub := rdb.PSubscribe(ctx, "__keyevent@0__:expired")
    defer pubsub.Close()
    
    ch := pubsub.Channel()
    
    for {
        select {
        case <-ctx.Done():
            return
        case msg := <-ch:
            // msg.Channel: __keyevent@0__:expired
            // msg.Payload: key que expiró (ej: lock:1:2026-03-27-15:04)
            
            if strings.HasPrefix(msg.Payload, "lock:") {
                handleLockExpiration(msg.Payload)
            }
        }
    }
}

func handleLockExpiration(lockKey string) {
    // Log para debugging
    log.Printf("Lock expired: %s", lockKey)
    
    // Cleanup si es necesario
    // (el lock ya fue auto-released por Redis)
    
    // Notificar a servicios interesados
    // ...
}
```

### Cleanup de Locks Expirados

```sql
-- Tabla para tracking de locks (opcional, para auditing)
CREATE TABLE booking_locks (
    lock_key VARCHAR(255) PRIMARY KEY,
    owner_token UUID NOT NULL,
    provider_id INT NOT NULL,
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

```go
func getActiveLocks(ctx context.Context, rdb *redis.Client, pattern string) ([]string, error) {
    // Buscar keys de lock
    keys, err := rdb.Keys(ctx, pattern).Result()
    if err != nil {
        return nil, err
    }
    
    // Obtener TTL de cada lock
    var activeLocks []string
    for _, key := range keys {
        ttl, err := rdb.TTL(ctx, key).Result()
        if err != nil {
            continue
        }
        
        activeLocks = append(activeLocks, fmt.Sprintf("%s (TTL: %v)", key, ttl))
    }
    
    return activeLocks, nil
}

// Uso: getActiveLocks(ctx, rdb, "lock:*")
```

## Errores Comunes

### ❌ No Usar Owner Token

```go
// MAL: Cualquiera puede liberar el lock
rdb.Del(ctx, lockKey)

// BIEN: Verificar ownership con Lua script
unlockScript.Run(ctx, rdb, []string{lockKey}, ownerToken)
```

### ❌ Lock Sin TTL

```go
// MAL: Deadlock seguro si cliente muere
rdb.SetNX(ctx, lockKey, token, 0)

// BIEN: Con TTL y auto-release
rdb.SetNX(ctx, lockKey, token, 5*time.Minute)
```

### ❌ No Extender Lock en Operaciones Largas

```go
// MAL: Lock expira durante operación
lock, _ := acquireLock(ctx, rdb, resource, 1*time.Minute)
time.Sleep(2 * time.Minute) // Lock ya expiró!
// Operación en recurso compartido → RACE CONDITION

// BIEN: Auto-renewal
ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
defer cancel()
lock.StartAutoRenewal(ctx, 30*time.Second)
time.Sleep(2 * time.Minute)
lock.Release(ctx)
```

### ❌ Usar Redlock Cuando Postgres Es Suficiente

```go
// MAL: Complejidad innecesaria
// Si ya usas PostgreSQL y es monolito:
redlock.Lock() // Requiere 5 Redis instances!

// BIEN: Advisory lock
SELECT pg_advisory_lock(key) // Simple y efectivo
```

### ❌ No Manejar Lock Expiration

```go
// MAL: Asumir que el lock persiste
lock, _ := acquireLock(ctx, rdb, resource, 5*time.Minute)
time.Sleep(10 * time.Minute) // Lock expiró!
// Operación insegura

// BIEN: Verificar y extender
lock, _ := acquireLock(ctx, rdb, resource, 5*time.Minute)
go lock.StartAutoRenewal(ctx, 1*time.Minute)
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
