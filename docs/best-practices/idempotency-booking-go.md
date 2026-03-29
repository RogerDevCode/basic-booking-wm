# Idempotencia en Booking System con Go y PostgreSQL - Best Practices

## ¿Qué es Idempotencia?

**Idempotencia** garantiza que múltiples ejecuciones de la misma operación producen el mismo resultado que una sola ejecución.

### En Booking System

```
Usuario envía: "Reservar cita para mañana 3pm"
  ↓
Intento 1: ✅ Reserva creada (ID: BK-123)
Intento 2 (retry por timeout de red): ✅ Retorna misma reserva (ID: BK-123)
Intento 3 (doble click): ✅ Retorna misma reserva (ID: BK-123)

Resultado: 1 reserva creada, no 3 duplicadas
```

## Generación de Idempotency Keys

### Estrategia 1: Hash SHA256 de Parámetros (Recomendado para Booking)

```go
package inner

import (
    "crypto/sha256"
    "encoding/hex"
    "fmt"
)

// Generar idempotency key determinística de parámetros de booking
func generateIdempotencyKey(
    providerID int,
    serviceID int,
    startTime string,
    chatID string,
) string {
    // Concatenar parámetros en orden consistente
    raw := fmt.Sprintf("%d:%d:%s:%s", providerID, serviceID, startTime, chatID)
    
    // Hash SHA256
    hash := sha256.Sum256([]byte(raw))
    
    // Convertir a hex string (64 caracteres)
    return hex.EncodeToString(hash[:])
}

// Ejemplo de uso
func main(ctx context.Context, providerID, serviceID int, startTime, chatID string) (map[string]any, error) {
    // Generar key única para esta combinación
    idempotencyKey := generateIdempotencyKey(providerID, serviceID, startTime, chatID)
    // Resultado: "a1b2c3d4e5f6..." (64 chars)
    
    // Verificar si ya fue procesado
    existing, err := checkIdempotencyKey(ctx, db, idempotencyKey)
    if err != nil {
        return nil, err
    }
    if existing != nil {
        // Ya fue procesado, retornar respuesta cacheada
        return existing.Response, nil
    }
    
    // Procesar booking...
}
```

### Estrategia 2: UUID del Cliente

```go
import "github.com/google/uuid"

// Cliente genera UUID único por operación
func createIdempotencyKey() string {
    return uuid.New().String()
    // Resultado: "550e8400-e29b-41d4-a716-446655440000"
}
```

### Estrategia 3: Combinada (Hash + Timestamp)

```go
func generateIdempotencyKeyWithTimestamp(
    providerID int,
    serviceID int,
    startTime string,
    chatID string,
    timestamp int64,
) string {
    // Agregar timestamp para permitir re-booking después de la ventana
    raw := fmt.Sprintf("%d:%d:%s:%s:%d", providerID, serviceID, startTime, chatID, timestamp)
    hash := sha256.Sum256([]byte(raw))
    return hex.EncodeToString(hash[:])
}
```

### Comparación de Estrategias

| Estrategia | Ventajas | Desventajas | Cuándo Usar |
|------------|----------|-------------|-------------|
| **SHA256(parámetros)** | Determinística, sin storage del cliente | Requiere mismos parámetros | Booking system (recomendado) |
| **UUID cliente** | Simple, sin colisiones | Cliente debe almacenar/generar | APIs REST, pagos |
| **Header Idempotency-Key** | Estándar HTTP | Requiere cliente consciente | APIs públicas |

## Esquema de Tabla

### Tabla de Idempotency Keys

```sql
-- Tabla principal
CREATE TABLE idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Key única (hash o UUID)
    idempotency_key VARCHAR(64) NOT NULL,
    
    -- Contexto del booking
    provider_id INT,
    service_id INT,
    start_time TIMESTAMPTZ,
    chat_id VARCHAR(50),
    
    -- Estado y respuesta
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    response_code INT,
    response_body JSONB,
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED'))
);

-- Índice único CRÍTICO para prevención de duplicados
CREATE UNIQUE INDEX idx_idempotency_key_unique 
    ON idempotency_keys(idempotency_key) 
    WHERE status != 'EXPIRED';

-- Índices para queries
CREATE INDEX idx_idempotency_key ON idempotency_keys(idempotency_key);
CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);
CREATE INDEX idx_idempotency_provider ON idempotency_keys(provider_id);
CREATE INDEX idx_idempotency_chat ON idempotency_keys(chat_id);

-- Cleanup automático (opcional, requiere pg_cron o job externo)
-- DELETE FROM idempotency_keys WHERE expires_at < NOW();
```

### Ventanas de Deduplicación (TTL)

```sql
-- TTL por tipo de operación
-- Booking: 24 horas (cubre retries automáticos y re-intentos del usuario)
-- Pagos: 7 días (ventana de disputas)
-- Notificaciones: 1 hora (retries inmediatos)

-- Ejemplo: Insertar con TTL de 24h
INSERT INTO idempotency_keys (
    idempotency_key, provider_id, service_id, 
    status, expires_at
) VALUES (
    'hash-a1b2c3...', 1, 1,
    'PENDING',
    NOW() + INTERVAL '24 hours'
);
```

### Recomendaciones de TTL

| Tipo de Operación | TTL Recomendado | Razón |
|-------------------|-----------------|-------|
| **Booking creation** | 24 horas | Cubre retries + usuario re-intentando |
| **Booking cancellation** | 7 días | Ventana de disputas/reconsideración |
| **Payment processing** | 7-30 días | Disputas, chargebacks |
| **Email/SMS notification** | 1 hora | Solo retries inmediatos |
| **Availability check** | 5 minutos | Datos efímeros, alta concurrencia |

## Implementación en Go

### Check-Then-Insert Pattern (Atómico)

```go
import (
    "context"
    "database/sql"
    "encoding/json"
    "fmt"
    
    "github.com/lib/pq"
)

type IdempotencyRecord struct {
    Key           string
    Status        string
    ResponseCode  int
    ResponseBody  json.RawMessage
}

// Verificar y crear key atómicamente
func claimIdempotencyKey(
    ctx context.Context,
    db *sql.DB,
    idempotencyKey string,
    providerID int,
    serviceID int,
    startTime string,
    chatID string,
    ttlHours int,
) (*IdempotencyRecord, error) {
    query := `
        INSERT INTO idempotency_keys (
            idempotency_key, provider_id, service_id,
            start_time, chat_id, status, expires_at
        ) VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW() + INTERVAL '%d hours')
        ON CONFLICT (idempotency_key) 
        WHERE status != 'EXPIRED'
        DO UPDATE SET 
            status = idempotency_keys.status,
            response_code = idempotency_keys.response_code,
            response_body = idempotency_keys.response_body
        RETURNING status, response_code, response_body
    `
    
    var record IdempotencyRecord
    var responseBody []byte
    
    err := db.QueryRowContext(ctx, query,
        idempotencyKey, providerID, serviceID,
        startTime, chatID, ttlHours,
    ).Scan(&record.Status, &record.ResponseCode, &responseBody)
    
    if err != nil {
        return nil, fmt.Errorf("failed to claim idempotency key: %w", err)
    }
    
    record.ResponseBody = responseBody
    return &record, nil
}

// Completar key con respuesta exitosa
func completeIdempotencyKey(
    ctx context.Context,
    db *sql.DB,
    idempotencyKey string,
    responseCode int,
    responseBody any,
) error {
    responseJSON, err := json.Marshal(responseBody)
    if err != nil {
        return err
    }
    
    query := `
        UPDATE idempotency_keys
        SET status = 'COMPLETED',
            response_code = $2,
            response_body = $3,
            processed_at = NOW()
        WHERE idempotency_key = $1
          AND status = 'PENDING'
    `
    
    _, err = db.ExecContext(ctx, query, idempotencyKey, responseCode, responseJSON)
    return err
}

// Marcar como fallido
func failIdempotencyKey(
    ctx context.Context,
    db *sql.DB,
    idempotencyKey string,
    errorCode int,
    errorBody any,
) error {
    errorJSON, _ := json.Marshal(errorBody)
    
    query := `
        UPDATE idempotency_keys
        SET status = 'FAILED',
            response_code = $2,
            response_body = $3,
            processed_at = NOW()
        WHERE idempotency_key = $1
          AND status = 'PENDING'
    `
    
    _, err := db.ExecContext(ctx, query, idempotencyKey, errorCode, errorJSON)
    return err
}
```

### Wrapper con Idempotencia

```go
// Ejecutar operación con verificación de idempotencia
func executeWithIdempotency(
    ctx context.Context,
    db *sql.DB,
    idempotencyKey string,
    providerID int,
    serviceID int,
    startTime string,
    chatID string,
    operation func() (any, int, error),
) (any, error) {
    // 1. Intentar claim de key
    record, err := claimIdempotencyKey(
        ctx, db, idempotencyKey,
        providerID, serviceID, startTime, chatID,
        24, // TTL 24h
    )
    if err != nil {
        return nil, err
    }
    
    // 2. Si ya está COMPLETED, retornar respuesta cacheada
    if record.Status == 'COMPLETED' {
        return record.ResponseBody, nil
    }
    
    // 3. Si está PENDING, ejecutar operación
    response, code, err := operation()
    
    if err != nil {
        // 4a. Falló: marcar como FAILED
        failIdempotencyKey(ctx, db, idempotencyKey, code, response)
        return nil, err
    }
    
    // 4b. Exitó: marcar como COMPLETED
    if err := completeIdempotencyKey(ctx, db, idempotencyKey, code, response); err != nil {
        // Error al guardar respuesta, pero operación ya se ejecutó
        // Loggear pero no retornar error al usuario
        log.Printf("Failed to save idempotency response: %v", err)
    }
    
    return response, nil
}

// Uso en script Windmill
func main(
    ctx context.Context,
    providerID int,
    serviceID int,
    startTime string,
    chatID string,
) (map[string]any, error) {
    // Generar key
    idempotencyKey := generateIdempotencyKey(providerID, serviceID, startTime, chatID)
    
    // Ejecutar con idempotencia
    response, err := executeWithIdempotency(
        ctx, db, idempotencyKey,
        providerID, serviceID, startTime, chatID,
        func() (any, int, error) {
            // Operación de booking
            return createBooking(ctx, providerID, serviceID, startTime, chatID)
        },
    )
    
    return response, err
}
```

### Patrón: INSERT ON CONFLICT

```go
// Alternativa: Usar INSERT ... ON CONFLICT directamente
func createBookingWithIdempotency(
    ctx context.Context,
    tx *sql.Tx,
    bookingData BookingData,
    idempotencyKey string,
) (*Booking, error) {
    // 1. Insertar booking con unique constraint
    bookingQuery := `
        INSERT INTO bookings (
            idempotency_key, provider_id, service_id,
            start_time, end_time, chat_id, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'CONFIRMED')
        ON CONFLICT (idempotency_key) DO UPDATE SET
            status = bookings.status,
            updated_at = NOW()
        RETURNING id, provider_id, service_id, start_time, status
    `
    
    var booking Booking
    err := tx.QueryRowContext(ctx, bookingQuery,
        idempotencyKey,
        bookingData.ProviderID,
        bookingData.ServiceID,
        bookingData.StartTime,
        bookingData.EndTime,
        bookingData.ChatID,
    ).Scan(&booking.ID, &booking.ProviderID, &booking.ServiceID, &booking.StartTime, &booking.Status)
    
    if err != nil {
        var pqErr *pq.Error
        if errors.As(err, &pqErr) && pqErr.Code == "23505" {
            // Unique constraint violation: ya existe
            return getExistingBooking(ctx, tx, idempotencyKey)
        }
        return nil, err
    }
    
    return &booking, nil
}
```

## Limpieza de Keys Expiradas

### Job de Cleanup

```go
// Ejecutar cleanup periódicamente (cada 6 horas)
func startIdempotencyCleanup(ctx context.Context, db *sql.DB, interval time.Duration) {
    ticker := time.NewTicker(interval)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            deleted, err := cleanupExpiredIdempotencyKeys(ctx, db)
            if err != nil {
                log.Printf("Idempotency cleanup error: %v", err)
            } else {
                log.Printf("Cleaned up %d expired idempotency keys", deleted)
            }
        }
    }
}

func cleanupExpiredIdempotencyKeys(ctx context.Context, db *sql.DB) (int64, error) {
    query := `
        DELETE FROM idempotency_keys
        WHERE expires_at < NOW()
          AND status IN ('COMPLETED', 'FAILED')
    `
    
    result, err := db.ExecContext(ctx, query)
    if err != nil {
        return 0, err
    }
    
    return result.RowsAffected()
}

// Uso en main.go
func main() {
    // ... setup ...
    
    // Iniciar cleanup job
    go startIdempotencyCleanup(context.Background(), db, 6*time.Hour)
    
    // ... resto de la aplicación ...
}
```

### Cleanup con pg_cron (PostgreSQL Extension)

```sql
-- Habilitar pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Programar cleanup diario a las 3 AM
SELECT cron.schedule(
    'cleanup-idempotency-keys',
    '0 3 * * *',  -- Cron expression
    $$DELETE FROM idempotency_keys WHERE expires_at < NOW()$$
);

-- Verificar jobs programados
SELECT * FROM cron.job;
```

## Uso en Scripts Windmill

### Script: Check Idempotency

```go
package inner

// Verificar si una key ya fue procesada
func main(
    ctx context.Context,
    idempotencyKey string,
) (map[string]any, error) {
    query := `
        SELECT status, response_code, response_body, created_at, expires_at
        FROM idempotency_keys
        WHERE idempotency_key = $1
          AND status != 'EXPIRED'
    `
    
    var status string
    var code int
    var body []byte
    var createdAt, expiresAt time.Time
    
    err := db.QueryRowContext(ctx, query, idempotencyKey).Scan(
        &status, &code, &body, &createdAt, &expiresAt,
    )
    
    if err == sql.ErrNoRows {
        return map[string]any{
            "exists": false,
        }, nil
    }
    
    if err != nil {
        return nil, err
    }
    
    return map[string]any{
        "exists":       true,
        "status":       status,
        "response_code": code,
        "response_body": json.RawMessage(body),
        "created_at":   createdAt,
        "expires_at":   expiresAt,
    }, nil
}
```

### Script: Create Idempotency Key

```go
package inner

// Crear nueva key de idempotencia
func main(
    ctx context.Context,
    providerID int,
    serviceID int,
    startTime string,
    chatID string,
    ttlHours int,
) (map[string]any, error) {
    // Generar key
    key := generateIdempotencyKey(providerID, serviceID, startTime, chatID)
    
    // Insertar
    query := `
        INSERT INTO idempotency_keys (
            idempotency_key, provider_id, service_id,
            start_time, chat_id, status, expires_at
        ) VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW() + INTERVAL '%d hours')
        ON CONFLICT (idempotency_key) WHERE status != 'EXPIRED'
        DO NOTHING
        RETURNING id
    `
    
    var id string
    err := db.QueryRowContext(ctx, query, key, providerID, serviceID, startTime, chatID, ttlHours).Scan(&id)
    
    if err == sql.ErrNoRows {
        // Ya existe
        return map[string]any{
            "created": false,
            "key":     key,
            "message": "Key already exists",
        }, nil
    }
    
    if err != nil {
        return nil, err
    }
    
    return map[string]any{
        "created": true,
        "key":     key,
        "id":      id,
    }, nil
}
```

## Errores Comunes

### ❌ No Usar Transacción

```go
// MAL: Race condition entre check e insert
existing, _ := checkIdempotencyKey(ctx, db, key)
if existing != nil {
    return existing.Response
}
// Otro proceso puede insertar aquí
createBooking(ctx, db, data) // ¡Duplicado!

// BIEN: INSERT ... ON CONFLICT atómico
INSERT INTO bookings (idempotency_key, ...)
VALUES (...)
ON CONFLICT (idempotency_key) DO UPDATE ...
```

### ❌ TTL Muy Corto

```go
// MAL: 5 minutos no cubre retries del cliente
expiresAt := time.Now().Add(5 * time.Minute)

// BIEN: 24 horas para booking
expiresAt := time.Now().Add(24 * time.Hour)
```

### ❌ No Limpiar Keys Expiradas

```go
// MAL: Tabla crece indefinidamente
// Sin cleanup job

// BIEN: Cleanup periódico
go startIdempotencyCleanup(ctx, db, 6*time.Hour)
```

### ❌ Hash No Determinístico

```go
// MAL: Orden de parámetros inconsistente
raw := fmt.Sprintf("%s:%d", chatID, providerID) // ¿Qué pasa si otro usa providerID:chatID?

// BIEN: Orden consistente y documentado
raw := fmt.Sprintf("%d:%d:%s:%s", providerID, serviceID, startTime, chatID)
```

### ❌ No Manejar Conflictos

```go
// MAL: Ignorar error de unique constraint
_, err := db.Exec("INSERT INTO bookings (idempotency_key, ...) VALUES (...)")
if err != nil {
    return err // ¡Puede ser duplicado legítimo!
}

// BIEN: Verificar si es conflicto
_, err := db.Exec("INSERT ... ON CONFLICT ...")
if err != nil {
    var pqErr *pq.Error
    if errors.As(err, &pqErr) && pqErr.Code == "23505" {
        // Retornar respuesta existente
        return getExistingResponse(ctx, db, key)
    }
    return err
}
```

## Métricas a Monitorear

| Métrica | Alerta Si | Acción |
|---------|-----------|--------|
| Keys creadas/hora | > 10,000 | Posible ataque o bug |
| Keys expiradas sin cleanup | > 100,000 | Ejecutar cleanup manual |
| Conflict rate | > 20% | Posible retry storm |
| Pending keys > 1h | > 100 | Posible deadlock |

## Checklist Producción

- [ ] Función `generateIdempotencyKey` con SHA256
- [ ] Tabla `idempotency_keys` con índices únicos
- [ ] TTL configurado por tipo de operación (24h para booking)
- [ ] INSERT ... ON CONFLICT para claim atómico
- [ ] Cleanup job programado (pg_cron o goroutine)
- [ ] Manejo de unique constraint violations
- [ ] Retorno de respuesta cacheada para duplicates
- [ ] Logging de idempotency hits/misses
- [ ] Métricas de conflict rate
- [ ] Runbook para cleanup manual de emergencia
