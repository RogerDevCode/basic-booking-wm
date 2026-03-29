# PostgreSQL 17 con Go y Windmill - Best Practices

## Connection Pooling

### Configuración Base

```go
db.SetMaxOpenConns(25)           // Máximo conexiones abiertas
db.SetMaxIdleConns(10)           // Conexiones idle (25-50% de MaxOpen)
db.SetConnMaxLifetime(30 * time.Minute)  // Rotar conexiones viejas
db.SetConnMaxIdleTime(10 * time.Minute)  // Cerrar idle después de
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
cpuOptimal = runtime.NumCPU() * 3
```

**Recomendado producción:**
- `MaxOpenConns`: 25 (ajustar según DB max_connections / instancias)
- `MaxIdleConns`: 10-12 (40-50% de MaxOpen)
- `ConnMaxLifetime`: 30 min (10 min con load balancer + 2 min jitter)
- `ConnMaxIdleTime`: 5-10 min

### Factores de Ajuste

| Factor | Ajuste |
|--------|--------|
| Load Balancer | Reducir ConnMaxLifetime a 10 min |
| Alta concurrencia | Aumentar MaxOpenConns gradualmente |
| Managed DB (costo por conexión) | Reducir MaxIdleConns, cerrar rápido |
| Tráfico alto | Mantener más conexiones warm (MaxIdle 50% de MaxOpen) |

## Transacciones

### Patrón Helper Function

```go
func executeTx(db *sql.DB, fn func(*sql.Tx) error) error {
    tx, err := db.BeginTx(context.Background(), &sql.TxOptions{
        Isolation: sql.LevelReadCommitted,
    })
    if err != nil {
        return err
    }
    
    defer func() {
        if p := recover(); p != nil {
            tx.Rollback()
            panic(p)
        }
    }()
    
    if err := fn(tx); err != nil {
        if rbErr := tx.Rollback(); rbErr != nil {
            return fmt.Errorf("tx error: %v, rollback: %w", err, rbErr)
        }
        return err
    }
    
    return tx.Commit()
}
```

### Uso en Booking System

```go
err := executeTx(db, func(tx *sql.Tx) error {
    // 1. Verificar disponibilidad con SELECT FOR UPDATE
    // 2. Crear booking
    // 3. Registrar en availability
    // 4. Log a DLQ si falla
    return nil
})
```

## Manejo de Errores

### Error Específico PostgreSQL

```go
import "github.com/lib/pq"

if err != nil {
    var pqErr *pq.Error
    if errors.As(err, &pqErr) {
        switch pqErr.Code {
        case "23505": // Unique violation
            return ErrBookingExists
        case "23503": // Foreign key violation
            return ErrInvalidProvider
        case "40001": // Serialization failure
            return ErrRetry // Reintentar
        case "53300": // Too many connections
            return ErrPoolExhausted
        }
    }
    return err
}
```

### Retry Logic para Errores Transitorios

```go
func retryOnSerialization(f func() error, maxRetries int) error {
    for i := 0; i < maxRetries; i++ {
        err := f()
        if err == nil {
            return nil
        }
        
        var pqErr *pq.Error
        if errors.As(err, &pqErr) && pqErr.Code == "40001" {
            time.Sleep(time.Duration(i*i) * 100 * time.Millisecond) // Backoff
            continue
        }
        return err
    }
    return ErrMaxRetriesExceeded
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
ALTER TABLE bookings ADD COLUMN provider_id INT;
UPDATE bookings SET provider_id = (metadata->>'provider_id')::INT;
CREATE INDEX idx_provider_id ON bookings(provider_id);
```

## Esquemas para Booking System

### Tablas Principales

```sql
-- bookings: estado final de reservas
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id INT NOT NULL,
    service_id INT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    gcal_event_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider_id, start_time) -- Prevenir double-booking
);

-- booking_locks: locks distribuidos (Redis también)
CREATE TABLE booking_locks (
    lock_key VARCHAR(255) PRIMARY KEY,
    owner_token UUID NOT NULL,
    provider_id INT NOT NULL,
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

export async function main(db: RT.Postgresql) {
    // wmill obtiene connection string del resource
    const connStr = await wmill.databaseUrlFromResource(db);
    
    // Usar con node-postgres
    const client = new Client(connStr);
    await client.connect();
    
    try {
        await client.query('SELECT 1');
    } finally {
        await client.end();
    }
}
```

### Configuración en Windmill

1. Crear resource tipo `postgresql` en UI
2. Path: `f/resources/booking-db`
3. Campos: host, port, user, password, dbname, sslmode
4. Referenciar en script: `main(db: RT.Postgresql)`

## Graceful Shutdown

```go
func main() {
    db := initDB()
    defer db.Close()
    
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit
    
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()
    
    if err := db.Close(); err != nil {
        log.Fatalf("Shutdown error: %v", err)
    }
}
```

## Errores Comunes

### ❌ No Configurar Pool

```go
// MAL: Sin límites, puede agotar DB
db, err := sql.Open("postgres", dsn)

// BIEN: Configurar pool
db.SetMaxOpenConns(25)
db.SetMaxIdleConns(10)
db.SetConnMaxLifetime(30 * time.Minute)
```

### ❌ No Verificar Errores de Rows

```go
// MAL: Puede leak conexiones
rows, _ := db.Query("SELECT * FROM bookings")
for rows.Next() {
    // process
}

// BIEN: Siempre verificar error y cerrar
rows, err := db.Query("SELECT * FROM bookings")
if err != nil {
    return err
}
defer rows.Close()
for rows.Next() {
    // process
}
if err := rows.Err(); err != nil {
    return err
}
```

### ❌ No Usar Prepared Statements

```go
// MAL: SQL injection risk, performance
query := fmt.Sprintf("SELECT * FROM bookings WHERE id = '%s'", id)

// BIEN: Prepared statement
var booking Booking
err := db.QueryRow("SELECT * FROM bookings WHERE id = $1", id).Scan(...)
```

### ❌ Ignorar Context en Queries

```go
// MAL: Sin timeout, puede bloquear indefinidamente
db.Query("SELECT * FROM bookings")

// BIEN: Con context y timeout
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
rows, err := db.QueryContext(ctx, "SELECT * FROM bookings")
```

## Métricas a Monitorear

| Métrica | Alerta Si |
|---------|-----------|
| Conexiones activas | > 80% de MaxOpenConns |
| Conexiones idle | < 2 (pool frío) |
| Query duration p95 | > 500ms |
| Transaction rollback rate | > 5% |
| Deadlocks por minuto | > 0 |
| DLQ entries pendientes | > 100 |

## Checklist Producción

- [ ] Pool sizing configurado según fórmula
- [ ] ConnMaxLifetime < DB timeout
- [ ] Graceful shutdown implementado
- [ ] Errores PostgreSQL tipificados con pq.Error
- [ ] Retry logic para errores 40001 (serialization)
- [ ] Índices GIN en JSONB para queries frecuentes
- [ ] Campos calientes promovidos a columnas
- [ ] Unique constraints para prevenir double-booking
- [ ] DLQ con retry exponencial
- [ ] Health check con db.Ping()
- [ ] Métricas de pool expuestas
