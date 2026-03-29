# Dead Letter Queue (DLQ) en Go con PostgreSQL - Best Practices

## Esquema de Tabla DLQ

### Tabla Principal

```sql
-- Tipo ENUM para estados
CREATE TYPE dlq_status AS ENUM (
    'PENDING',      -- Esperando retry
    'PROCESSING',   -- Siendo procesado
    'SUCCEEDED',    -- Procesado exitosamente
    'FAILED',       -- Falló después de max_retries
    'CANCELLED'     -- Cancelado manualmente
);

-- Tabla DLQ
CREATE TABLE dlq_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identificación del mensaje
    event_type VARCHAR(255) NOT NULL,
    event_key VARCHAR(255),           -- Para idempotencia (unique constraint)
    
    -- Payload del mensaje
    payload JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',      -- Contexto adicional
    
    -- Estado y reintentos
    status dlq_status NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 5,
    
    -- Timing de retries
    next_retry_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    
    -- Información de error
    error_reason TEXT,
    error_stacktrace TEXT,
    error_type VARCHAR(100),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT valid_retry_count CHECK (retry_count >= 0),
    CONSTRAINT valid_max_retries CHECK (max_retries > 0)
);

-- Índices críticos
CREATE INDEX idx_dlq_status ON dlq_entries(status);
CREATE INDEX idx_dlq_status_retry ON dlq_entries(status, next_retry_at) 
    WHERE status = 'PENDING';
CREATE INDEX idx_dlq_next_retry ON dlq_entries(next_retry_at) 
    WHERE status = 'PENDING';
CREATE INDEX idx_dlq_event_type ON dlq_entries(event_type);
CREATE INDEX idx_dlq_created_at ON dlq_entries(created_at DESC);
CREATE INDEX idx_dlq_event_key ON dlq_entries(event_key) 
    WHERE event_key IS NOT NULL;

-- Unique constraint para idempotencia (opcional)
CREATE UNIQUE INDEX idx_dlq_event_key_unique 
    ON dlq_entries(event_key) 
    WHERE status != 'CANCELLED';

-- Trigger para updated_at
CREATE TRIGGER trg_dlq_updated_at
    BEFORE UPDATE ON dlq_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### Tabla de Historial de Intentos (Opcional)

```sql
-- Historial detallado de cada intento
CREATE TABLE dlq_attempt_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dlq_entry_id UUID NOT NULL REFERENCES dlq_entries(id) ON DELETE CASCADE,
    attempt_number INT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    success BOOLEAN NOT NULL DEFAULT false,
    error_reason TEXT,
    error_stacktrace TEXT,
    processing_time_ms INT,
    
    CONSTRAINT valid_attempt_number CHECK (attempt_number > 0)
);

CREATE INDEX idx_attempt_dlq_entry ON dlq_attempt_history(dlq_entry_id);
CREATE INDEX idx_attempt_started ON dlq_attempt_history(started_at DESC);
```

## Backoff Exponencial con Jitter

### Fórmula de Backoff

```go
package inner

import (
    "context"
    "fmt"
    "math/rand"
    "time"
)

// RetryConfig configura el comportamiento de reintentos
type RetryConfig struct {
    MaxRetries     int           // Máximo número de reintentos
    InitialBackoff time.Duration // Delay inicial
    MaxBackoff     time.Duration // Delay máximo
    Multiplier     float64       // Multiplicador exponencial
    Jitter         float64       // Jitter (0.0 - 1.0)
}

// DefaultRetryConfig retorna configuración por defecto
func DefaultRetryConfig() RetryConfig {
    return RetryConfig{
        MaxRetries:     5,
        InitialBackoff: 1 * time.Minute,
        MaxBackoff:     30 * time.Minute,
        Multiplier:     2.0,
        Jitter:         0.2, // 20% jitter
    }
}

// Calcular delay con backoff exponencial y jitter
func calculateBackoff(attempt int, config RetryConfig) time.Duration {
    // Backoff exponencial: initial * (multiplier ^ attempt)
    backoff := float64(config.InitialBackoff)
    for i := 0; i < attempt && backoff < float64(config.MaxBackoff); i++ {
        backoff *= config.Multiplier
    }
    
    // Cap en MaxBackoff
    if backoff > float64(config.MaxBackoff) {
        backoff = float64(config.MaxBackoff)
    }
    
    // Agregar jitter (randomización para evitar thundering herd)
    if config.Jitter > 0 {
        jitterRange := backoff * config.Jitter
        jitter := (rand.Float64() * 2 * jitterRange) - jitterRange
        backoff += jitter
    }
    
    return time.Duration(backoff)
}

// Calcular next_retry_at
func calculateNextRetryAt(retryCount int, config RetryConfig) time.Time {
    delay := calculateBackoff(retryCount, config)
    return time.Now().Add(delay)
}
```

### Ejemplo de Delays

```go
// Con config por defecto (1min initial, 2x multiplier, 30min max):
// Intento 0: 1 minuto
// Intento 1: 2 minutos
// Intento 2: 4 minutos
// Intento 3: 8 minutos
// Intento 4: 16 minutos
// Intento 5: 30 minutos (cap)

// Con jitter del 20%:
// Intento 0: 48s - 1m 12s
// Intento 1: 1m 36s - 2m 24s
// etc.
```

## Implementación en Go

### Agregar a la DLQ

```go
import (
    "context"
    "encoding/json"
    "fmt"
    
    "github.com/google/uuid"
)

type DLQEntry struct {
    ID             string          `json:"id"`
    EventType      string          `json:"event_type"`
    EventKey       string          `json:"event_key,omitempty"`
    Payload        json.RawMessage `json:"payload"`
    Metadata       map[string]any  `json:"metadata"`
    ErrorReason    string          `json:"error_reason"`
    ErrorStacktrace string         `json:"error_stacktrace"`
    ErrorType      string          `json:"error_type"`
    RetryCount     int             `json:"retry_count"`
    MaxRetries     int             `json:"max_retries"`
    NextRetryAt    time.Time       `json:"next_retry_at"`
}

// Agregar mensaje fallido a la DLQ
func addToDLQ(
    ctx context.Context,
    db *sql.DB,
    eventType string,
    payload any,
    err error,
    retryCount int,
    config RetryConfig,
) error {
    // Serializar payload
    payloadJSON, err := json.Marshal(payload)
    if err != nil {
        return fmt.Errorf("failed to marshal payload: %w", err)
    }
    
    // Calcular next_retry_at
    nextRetryAt := calculateNextRetryAt(retryCount, config)
    
    // Extraer tipo de error
    errorType := extractErrorType(err)
    
    query := `
        INSERT INTO dlq_entries (
            id, event_type, payload, error_reason, error_stacktrace,
            error_type, retry_count, max_retries, next_retry_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `
    
    _, err = db.ExecContext(ctx, query,
        uuid.New().String(),
        eventType,
        payloadJSON,
        err.Error(),
        fmt.Sprintf("%+v", err), // Stack trace simple
        errorType,
        retryCount,
        config.MaxRetries,
        nextRetryAt,
    )
    
    return err
}

// Agregar con metadatos adicionales
func addToDLQWithMetadata(
    ctx context.Context,
    db *sql.DB,
    entry *DLQEntry,
) error {
    query := `
        INSERT INTO dlq_entries (
            id, event_type, event_key, payload, metadata,
            error_reason, error_stacktrace, error_type,
            retry_count, max_retries, next_retry_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `
    
    payloadJSON, _ := json.Marshal(entry.Payload)
    metadataJSON, _ := json.Marshal(entry.Metadata)
    
    _, err := db.ExecContext(ctx, query,
        entry.ID,
        entry.EventType,
        entry.EventKey,
        payloadJSON,
        metadataJSON,
        entry.ErrorReason,
        entry.ErrorStacktrace,
        entry.ErrorType,
        entry.RetryCount,
        entry.MaxRettries,
        entry.NextRetryAt,
    )
    
    return err
}
```

### Procesar DLQ (Worker)

```go
type DLQWorker struct {
    db     *sql.DB
    config RetryConfig
    logger Logger
}

func NewDLQWorker(db *sql.DB, config RetryConfig) *DLQWorker {
    return &DLQWorker{
        db:     db,
        config: config,
        logger: NewLogger(),
    }
}

// Procesar mensajes pendientes
func (w *DLQWorker) ProcessPending(ctx context.Context, batchSize int) (int, error) {
    // Seleccionar mensajes elegibles para retry
    query := `
        SELECT id, event_type, payload, retry_count, max_retries
        FROM dlq_entries
        WHERE status = 'PENDING'
          AND next_retry_at <= NOW()
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT $1
    `
    
    rows, err := db.QueryContext(ctx, query, batchSize)
    if err != nil {
        return 0, err
    }
    defer rows.Close()
    
    var processedCount int
    for rows.Next() {
        var entry DLQEntry
        if err := rows.Scan(&entry.ID, &entry.EventType, &entry.Payload, &entry.RetryCount, &entry.MaxRetries); err != nil {
            w.logger.Error("failed to scan DLQ entry", "error", err)
            continue
        }
        
        // Procesar mensaje
        if err := w.processMessage(ctx, &entry); err != nil {
            w.logger.Error("failed to process DLQ message", "id", entry.ID, "error", err)
        } else {
            processedCount++
        }
    }
    
    return processedCount, rows.Err()
}

// Procesar mensaje individual
func (w *DLQWorker) processMessage(ctx context.Context, entry *DLQEntry) error {
    // Marcar como PROCESSING
    if err := w.updateStatus(ctx, entry.ID, "PROCESSING", nil); err != nil {
        return err
    }
    
    // Registrar intento
    attemptStart := time.Now()
    
    // Ejecutar handler
    err := w.executeHandler(ctx, entry)
    
    attemptDuration := time.Since(attemptStart)
    
    if err == nil {
        // Éxito: marcar como SUCCEEDED
        return w.updateStatus(ctx, entry.ID, "SUCCEEDED", &attemptDuration)
    }
    
    // Falló: verificar si hay reintentos restantes
    newRetryCount := entry.RetryCount + 1
    if newRetryCount >= entry.MaxRetries {
        // Max retries alcanzado: marcar como FAILED
        return w.markAsFailed(ctx, entry.ID, err, newRetryCount, &attemptDuration)
    }
    
    // Calcular próximo retry
    nextRetryAt := calculateNextRetryAt(newRetryCount, w.config)
    
    // Actualizar para próximo retry
    return w.scheduleRetry(ctx, entry.ID, err, newRetryCount, nextRetryAt, &attemptDuration)
}

// Actualizar estado
func (w *DLQWorker) updateStatus(
    ctx context.Context,
    id string,
    status string,
    processingTime *time.Duration,
) error {
    var processingTimeMs *int
    if processingTime != nil {
        ms := int(processingTime.Milliseconds())
        processingTimeMs = &ms
    }
    
    query := `
        UPDATE dlq_entries
        SET status = $2,
            updated_at = NOW(),
            processed_at = CASE WHEN $2 = 'SUCCEEDED' THEN NOW() ELSE processed_at END,
            last_attempt_at = NOW()
        WHERE id = $1
    `
    
    _, err := w.db.ExecContext(ctx, query, id, status)
    return err
}

// Marcar como fallido (max retries)
func (w *DLQWorker) markAsFailed(
    ctx context.Context,
    id string,
    err error,
    retryCount int,
    processingTime *time.Duration,
) error {
    query := `
        UPDATE dlq_entries
        SET status = 'FAILED',
            retry_count = $2,
            error_reason = $3,
            error_stacktrace = $4,
            error_type = $5,
            updated_at = NOW(),
            last_attempt_at = NOW()
        WHERE id = $1
    `
    
    _, execErr := w.db.ExecContext(ctx, query,
        id,
        retryCount,
        err.Error(),
        fmt.Sprintf("%+v", err),
        extractErrorType(err),
    )
    
    // Alertar sobre fallo permanente
    w.sendAlert(id, err)
    
    return execErr
}

// Programar retry
func (w *DLQWorker) scheduleRetry(
    ctx context.Context,
    id string,
    err error,
    retryCount int,
    nextRetryAt time.Time,
    processingTime *time.Duration,
) error {
    query := `
        UPDATE dlq_entries
        SET status = 'PENDING',
            retry_count = $2,
            next_retry_at = $3,
            error_reason = $4,
            error_stacktrace = $5,
            error_type = $6,
            updated_at = NOW(),
            last_attempt_at = NOW()
        WHERE id = $1
    `
    
    _, execErr := w.db.ExecContext(ctx, query,
        id,
        retryCount,
        nextRetryAt,
        err.Error(),
        fmt.Sprintf("%+v", err),
        extractErrorType(err),
    )
    
    return execErr
}

// Ejecutar handler según event_type
func (w *DLQWorker) executeHandler(ctx context.Context, entry *DLQEntry) error {
    var payload json.RawMessage
    if err := json.Unmarshal(entry.Payload, &payload); err != nil {
        return err
    }
    
    switch entry.EventType {
    case "booking.create":
        return w.handleBookingCreate(ctx, payload)
    case "booking.cancel":
        return w.handleBookingCancel(ctx, payload)
    case "gcal.create":
        return w.handleGCalCreate(ctx, payload)
    case "telegram.send":
        return w.handleTelegramSend(ctx, payload)
    default:
        return fmt.Errorf("unknown event type: %s", entry.EventType)
    }
}
```

### Worker Scheduler

```go
// Ejecutar worker periódicamente
func StartDLQWorker(ctx context.Context, db *sql.DB, interval time.Duration) {
    worker := NewDLQWorker(db, DefaultRetryConfig())
    
    ticker := time.NewTicker(interval)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            processed, err := worker.ProcessPending(ctx, 50) // Batch de 50
            if err != nil {
                log.Printf("DLQ worker error: %v", err)
            }
            if processed > 0 {
                log.Printf("DLQ worker processed %d messages", processed)
            }
        }
    }
}

// Uso en main.go
func main() {
    // ... setup ...
    
    // Iniciar worker DLQ (cada 5 minutos)
    go StartDLQWorker(context.Background(), db, 5*time.Minute)
    
    // ... resto de la aplicación ...
}
```

## Replay de Mensajes

### Replay Manual (SQL)

```sql
-- Reintentar mensajes fallidos manualmente
UPDATE dlq_entries
SET status = 'PENDING',
    retry_count = 0,
    next_retry_at = NOW(),
    error_reason = NULL,
    updated_at = NOW()
WHERE status = 'FAILED'
  AND event_type = 'booking.create'
  AND created_at > NOW() - INTERVAL '7 days';

-- Reintentar un mensaje específico por ID
UPDATE dlq_entries
SET status = 'PENDING',
    retry_count = 0,
    next_retry_at = NOW()
WHERE id = 'uuid-here';

-- Reintentar todos los mensajes de un tipo específico
UPDATE dlq_entries
SET status = 'PENDING',
    retry_count = 0,
    next_retry_at = NOW()
WHERE event_type = 'gcal.create'
  AND status = 'FAILED';
```

### Replay Programático

```go
// Replay de mensajes fallidos
func replayFailedMessages(
    ctx context.Context,
    db *sql.DB,
    filter DLQFilter,
) (int, error) {
    query := `
        UPDATE dlq_entries
        SET status = 'PENDING',
            retry_count = 0,
            next_retry_at = NOW(),
            error_reason = NULL,
            error_stacktrace = NULL,
            updated_at = NOW()
        WHERE status = 'FAILED'
    `
    
    args := []interface{}{}
    argCount := 1
    
    if filter.EventType != "" {
        query += fmt.Sprintf(" AND event_type = $%d", argCount)
        args = append(args, filter.EventType)
        argCount++
    }
    
    if filter.Since != nil {
        query += fmt.Sprintf(" AND created_at >= $%d", argCount)
        args = append(args, filter.Since)
        argCount++
    }
    
    if filter.EventKey != "" {
        query += fmt.Sprintf(" AND event_key = $%d", argCount)
        args = append(args, filter.EventKey)
        argCount++
    }
    
    result, err := db.ExecContext(ctx, query, args...)
    if err != nil {
        return 0, err
    }
    
    return result.RowsAffected()
}

type DLQFilter struct {
    EventType string
    EventKey  string
    Since     *time.Time
    Status    string
}

// Replay con verificación de idempotencia
func replayWithIdempotencyCheck(
    ctx context.Context,
    db *sql.DB,
    entryID string,
) error {
    tx, err := db.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer tx.Rollback()
    
    // Verificar si ya fue procesado exitosamente
    var exists bool
    err = tx.QueryRowContext(ctx, `
        SELECT EXISTS(
            SELECT 1 FROM dlq_entries
            WHERE event_key = (
                SELECT event_key FROM dlq_entries WHERE id = $1
            )
            AND status = 'SUCCEEDED'
            AND id != $1
        )
    `, entryID).Scan(&exists)
    
    if exists {
        // Ya existe un mensaje exitoso con este key, no reintentar
        return ErrAlreadyProcessed
    }
    
    // Marcar para retry
    _, err = tx.ExecContext(ctx, `
        UPDATE dlq_entries
        SET status = 'PENDING',
            retry_count = 0,
            next_retry_at = NOW()
        WHERE id = $1
    `, entryID)
    
    if err != nil {
        return err
    }
    
    return tx.Commit()
}
```

## Monitoreo y Alertas

### Métricas Clave

```go
// Métricas de DLQ
type DLQMetrics struct {
    PendingCount     int64         `json:"pending_count"`
    FailedCount      int64         `json:"failed_count"`
    ProcessingCount  int64         `json:"processing_count"`
    OldestMessageAge time.Duration `json:"oldest_message_age"`
    AvgRetryCount    float64       `json:"avg_retry_count"`
    SuccessRate      float64       `json:"success_rate"`
}

// Obtener métricas
func getDLQMetrics(ctx context.Context, db *sql.DB) (*DLQMetrics, error) {
    query := `
        SELECT
            COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_count,
            COUNT(*) FILTER (WHERE status = 'FAILED') AS failed_count,
            COUNT(*) FILTER (WHERE status = 'PROCESSING') AS processing_count,
            EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) FILTER (WHERE status = 'PENDING') AS oldest_message_seconds,
            AVG(retry_count) FILTER (WHERE status IN ('SUCCEEDED', 'FAILED')) AS avg_retry_count,
            COUNT(*) FILTER (WHERE status = 'SUCCEEDED')::float / 
                NULLIF(COUNT(*) FILTER (WHERE status IN ('SUCCEEDED', 'FAILED')), 0) * 100 AS success_rate
        FROM dlq_entries
        WHERE created_at > NOW() - INTERVAL '24 hours'
    `
    
    var metrics DLQMetrics
    var oldestSeconds float64
    
    err := db.QueryRowContext(ctx, query).Scan(
        &metrics.PendingCount,
        &metrics.FailedCount,
        &metrics.ProcessingCount,
        &oldestSeconds,
        &metrics.AvgRetryCount,
        &metrics.SuccessRate,
    )
    
    if err != nil {
        return nil, err
    }
    
    metrics.OldestMessageAge = time.Duration(oldestSeconds) * time.Second
    
    return &metrics, nil
}
```

### Queries de Monitoreo

```sql
-- Conteo por estado
SELECT status, COUNT(*) as count
FROM dlq_entries
GROUP BY status;

-- Mensajes más antiguos pendientes
SELECT id, event_type, created_at, retry_count, next_retry_at,
       EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds
FROM dlq_entries
WHERE status = 'PENDING'
ORDER BY created_at
LIMIT 10;

-- Tasa de éxito por tipo de evento
SELECT 
    event_type,
    COUNT(*) FILTER (WHERE status = 'SUCCEEDED') as succeeded,
    COUNT(*) FILTER (WHERE status = 'FAILED') as failed,
    COUNT(*) FILTER (WHERE status = 'SUCCEEDED')::float / 
        NULLIF(COUNT(*), 0) * 100 as success_rate
FROM dlq_entries
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY event_type
ORDER BY success_rate ASC;

-- Errores más comunes
SELECT error_type, COUNT(*) as count
FROM dlq_entries
WHERE status = 'FAILED'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY error_type
ORDER BY count DESC
LIMIT 10;

-- Edad del mensaje más antiguo pendiente
SELECT 
    EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) as oldest_pending_seconds
FROM dlq_entries
WHERE status = 'PENDING';
```

### Alertas Recomendadas

```yaml
# Alertas Prometheus/Grafana

# DLQ Pending Count > 100
- alert: DLQHighPendingCount
  expr: dlq_pending_count > 100
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "DLQ pending count is high"
    description: "DLQ has {{ $value }} pending messages"

# DLQ Failed Count > 10
- alert: DLQHighFailedCount
  expr: dlq_failed_count > 10
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "DLQ has failed messages"
    description: "DLQ has {{ $value }} failed messages requiring attention"

# Oldest Message Age > 1 hour
- alert: DLQOldMessage
  expr: dlq_oldest_message_age_seconds > 3600
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "DLQ has old pending message"
    description: "Oldest DLQ message is {{ $value | humanizeDuration }} old"

# Success Rate < 80%
- alert: DLQLowSuccessRate
  expr: dlq_success_rate < 80
  for: 15m
  labels:
    severity: warning
  annotations:
    summary: "DLQ success rate is low"
    description: "DLQ success rate is {{ $value }}%"
```

### Dashboard SQL

```sql
-- Dashboard: Resumen de últimas 24h
SELECT 
    'Total Entries' as metric,
    COUNT(*)::text as value
FROM dlq_entries
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'Success Rate (%)',
    ROUND(COUNT(*) FILTER (WHERE status = 'SUCCEEDED')::numeric / 
          NULLIF(COUNT(*), 0) * 100, 2)::text
FROM dlq_entries
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'Avg Retry Count',
    ROUND(AVG(retry_count), 2)::text
FROM dlq_entries
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'Oldest Pending (min)',
    ROUND(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 60, 1)::text
FROM dlq_entries
WHERE status = 'PENDING';
```

## Errores Comunes

### ❌ No Usar SKIP LOCKED

```go
// MAL: Múltiples workers procesan el mismo mensaje
rows, _ := db.Query(`
    SELECT * FROM dlq_entries
    WHERE status = 'PENDING' AND next_retry_at <= NOW()
    LIMIT 50
`)

// BIEN: SKIP LOCKED previene procesamiento duplicado
rows, _ := db.Query(`
    SELECT * FROM dlq_entries
    WHERE status = 'PENDING' AND next_retry_at <= NOW()
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 50
`)
```

### ❌ No Límite de Reintentos

```go
// MAL: Retry infinito
for {
    err := processMessage(msg)
    if err != nil {
        continue // Retry forever!
    }
}

// BIEN: Límite con backoff
config := RetryConfig{MaxRetries: 5}
if retryCount >= config.MaxRetries {
    markAsFailed(msg) // Mover a DLQ permanente
    sendAlert(msg)
    return
}
```

### ❌ Backoff Sin Jitter

```go
// MAL: Todos los mensajes reintentan al mismo tiempo
nextRetry := time.Now().Add(time.Minute * time.Duration(retryCount))

// BIEN: Con jitter para evitar thundering herd
jitter := time.Duration(rand.Float64() * float64(baseDelay) * 0.2)
nextRetry := time.Now().Add(baseDelay + jitter)
```

### ❌ No Idempotencia en Replay

```go
// MAL: Puede procesar mensaje duplicado
UPDATE dlq_entries SET status = 'PENDING' WHERE id = $1

// BIEN: Verificar event_key antes de replay
SELECT EXISTS(
    SELECT 1 FROM dlq_entries
    WHERE event_key = $1 AND status = 'SUCCEEDED'
)
```

### ❌ No Monitorear

```go
// MAL: Sin métricas ni alertas
// DLQ crece sin control hasta que explota

// BIEN: Métricas y alertas configuradas
metrics := getDLQMetrics(ctx, db)
if metrics.PendingCount > 100 {
    sendAlert("DLQ pending count high")
}
if metrics.OldestMessageAge > time.Hour {
    sendAlert("DLQ has old messages")
}
```

## Checklist Producción

- [ ] Tabla DLQ con schema completo (status, retry_count, next_retry_at)
- [ ] Índices en (status, next_retry_at) y (event_type)
- [ ] Backoff exponencial con jitter configurado
- [ ] Límite de reintentos (max_retries)
- [ ] Worker con FOR UPDATE SKIP LOCKED
- [ ] Idempotencia con event_key
- [ ] Historial de intentos (opcional pero recomendado)
- [ ] Métricas de monitoreo (pending count, failed count, oldest age)
- [ ] Alertas configuradas (thresholds de count y age)
- [ ] Runbook para replay manual
- [ ] Dashboard de DLQ health
- [ ] Cleanup de mensajes antiguos (> 30 días)
