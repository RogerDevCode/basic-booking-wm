# Circuit Breaker Pattern en Go con PostgreSQL - Best Practices

## Estados del Circuit Breaker

### Máquina de Estados

```
┌─────────────┐
│   CLOSED    │ ← Estado normal, todas las requests pasan
│  (Cerrado)  │
└──────┬──────┘
       │
       │ Fallos > threshold
       ▼
┌─────────────┐
│    OPEN     │ ← Todas las requests fallan inmediatamente
│   (Abierto) │
└──────┬──────┘
       │
       │ Timeout expirado
       ▼
┌─────────────┐
│  HALF-OPEN  │ ← Testing, algunas requests pasan
│ (Semi-abierto)
└──────┬──────┘
       │
       │ Success → CLOSED
       │ Failure → OPEN
```

### Descripción de Estados

| Estado | Comportamiento | Cuándo Transiciona |
|--------|----------------|-------------------|
| **CLOSED** | Requests pasan normalmente, se monitorean fallos | → OPEN cuando fallos > threshold |
| **OPEN** | Requests fallan inmediatamente sin llamar al servicio | → HALF-OPEN cuando timeout expira |
| **HALF-OPEN** | Pocas requests de prueba para verificar recuperación | → CLOSED si éxito, → OPEN si fallo |

## Implementación con sony/gobreaker

### Configuración Básica

```go
package inner

import (
    "context"
    "fmt"
    "time"
    
    "github.com/sony/gobreaker/v2"
)

// Crear Circuit Breaker
func createCircuitBreaker(serviceName string) *gobreaker.CircuitBreaker[any] {
    settings := gobreaker.Settings{
        Name:        serviceName,
        MaxRequests: 3,           // Máx requests en HALF-OPEN
        Timeout:     60 * time.Second, // Tiempo en OPEN antes de HALF-OPEN
        
        // Cuando trippear a OPEN
        ReadyToTrip: func(counts gobreaker.Counts) bool {
            // Ejemplo: 5 fallos consecutivos
            return counts.ConsecutiveFailures >= 5
            
            // O: 50% failure rate con mínimo 10 requests
            // if counts.Requests < 10 {
            //     return false
            // }
            // failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
            // return failureRatio >= 0.5
        },
        
        // Callback para logging/monitoreo
        OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
            fmt.Printf("[%s] State changed from %s to %s\n", name, from, to)
            // Loggear a DB o sistema de métricas
        },
        
        // Determinar si un error cuenta como fallo
        IsSuccessful: func(err error) bool {
            // Errores de cliente (4xx) no cuentan como fallos del servicio
            if isClientError(err) {
                return true
            }
            return err == nil
        },
    }
    
    return gobreaker.NewCircuitBreaker[any](settings)
}

// Uso en script Windmill
func main(ctx context.Context, serviceID string) (map[string]any, error) {
    // Obtener o crear circuit breaker
    cb := getOrCreateCircuitBreaker(serviceID)
    
    // Ejecutar operación protegida
    result, err := cb.Execute(func() (any, error) {
        // Llamar servicio externo (GCal, Telegram, etc.)
        return callExternalService(ctx, serviceID)
    })
    
    if err != nil {
        return nil, err
    }
    
    return result.(map[string]any), nil
}
```

### Configuraciones Recomendadas por Servicio

```go
// Google Calendar API (externo, puede ser lento)
gcalSettings := gobreaker.Settings{
    Name:        "gcal",
    MaxRequests: 3,
    Timeout:     60 * time.Second,
    ReadyToTrip: func(counts gobreaker.Counts) bool {
        return counts.ConsecutiveFailures >= 5
    },
}

// Telegram API (más rápido, más tolerante)
telegramSettings := gobreaker.Settings{
    Name:        "telegram",
    MaxRequests: 5,
    Timeout:     30 * time.Second,
    ReadyToTrip: func(counts gobreaker.Counts) bool {
        return counts.ConsecutiveFailures >= 10
    },
}

// Base de datos local (muy tolerante)
dbSettings := gobreaker.Settings{
    Name:        "postgres",
    MaxRequests: 1,
    Timeout:     10 * time.Second,
    ReadyToTrip: func(counts gobreaker.Counts) bool {
        return counts.ConsecutiveFailures >= 3
    },
}
```

## Persistencia en PostgreSQL

### Schema de Tabla

```sql
-- Tabla para estado de circuit breakers
CREATE TABLE circuit_breaker_state (
    service_id VARCHAR(50) PRIMARY KEY,
    state VARCHAR(20) NOT NULL DEFAULT 'closed',
    failure_count INT NOT NULL DEFAULT 0,
    consecutive_failures INT NOT NULL DEFAULT 0,
    consecutive_successes INT NOT NULL DEFAULT 0,
    total_requests BIGINT NOT NULL DEFAULT 0,
    total_successes BIGINT NOT NULL DEFAULT 0,
    total_failures BIGINT NOT NULL DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    timeout_at TIMESTAMPTZ,  -- Cuándo transicionar a half-open
    opened_at TIMESTAMPTZ,   -- Cuándo se abrió el circuit
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para queries rápidas
CREATE INDEX idx_cb_state ON circuit_breaker_state(state);
CREATE INDEX idx_cb_timeout ON circuit_breaker_state(timeout_at) 
    WHERE state = 'open';

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_cb_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_cb_updated_at
    BEFORE UPDATE ON circuit_breaker_state
    FOR EACH ROW
    EXECUTE FUNCTION update_cb_updated_at();
```

### Funciones de Persistencia

```go
import (
    "database/sql"
    "time"
    
    "github.com/sony/gobreaker/v2"
)

// Estado serializable
type CircuitBreakerState struct {
    ServiceID           string
    State               string // "closed", "open", "half-open"
    FailureCount        int
    ConsecutiveFailures int
    ConsecutiveSuccesses int
    TotalRequests       int64
    TotalSuccesses      int64
    TotalFailures       int64
    LastFailureAt       *time.Time
    LastSuccessAt       *time.Time
    TimeoutAt           *time.Time
    OpenedAt            *time.Time
}

// Guardar estado en DB
func saveCircuitBreakerState(db *sql.DB, state *CircuitBreakerState) error {
    query := `
        INSERT INTO circuit_breaker_state (
            service_id, state, failure_count, consecutive_failures,
            consecutive_successes, total_requests, total_successes,
            total_failures, last_failure_at, last_success_at,
            timeout_at, opened_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
        )
        ON CONFLICT (service_id) DO UPDATE SET
            state = EXCLUDED.state,
            failure_count = EXCLUDED.failure_count,
            consecutive_failures = EXCLUDED.consecutive_failures,
            consecutive_successes = EXCLUDED.consecutive_successes,
            total_requests = EXCLUDED.total_requests,
            total_successes = EXCLUDED.total_successes,
            total_failures = EXCLUDED.total_failures,
            last_failure_at = COALESCE(EXCLUDED.last_failure_at, circuit_breaker_state.last_failure_at),
            last_success_at = COALESCE(EXCLUDED.last_success_at, circuit_breaker_state.last_success_at),
            timeout_at = EXCLUDED.timeout_at,
            opened_at = COALESCE(EXCLUDED.opened_at, circuit_breaker_state.opened_at),
            updated_at = NOW()
    `
    
    _, err := db.Exec(query,
        state.ServiceID,
        state.State,
        state.FailureCount,
        state.ConsecutiveFailures,
        state.ConsecutiveSuccesses,
        state.TotalRequests,
        state.TotalSuccesses,
        state.TotalFailures,
        state.LastFailureAt,
        state.LastSuccessAt,
        state.TimeoutAt,
        state.OpenedAt,
    )
    
    return err
}

// Cargar estado desde DB
func loadCircuitBreakerState(db *sql.DB, serviceID string) (*CircuitBreakerState, error) {
    query := `
        SELECT service_id, state, failure_count, consecutive_failures,
               consecutive_successes, total_requests, total_successes,
               total_failures, last_failure_at, last_success_at,
               timeout_at, opened_at
        FROM circuit_breaker_state
        WHERE service_id = $1
    `
    
    var state CircuitBreakerState
    err := db.QueryRow(query, serviceID).Scan(
        &state.ServiceID,
        &state.State,
        &state.FailureCount,
        &state.ConsecutiveFailures,
        &state.ConsecutiveSuccesses,
        &state.TotalRequests,
        &state.TotalSuccesses,
        &state.TotalFailures,
        &state.LastFailureAt,
        &state.LastSuccessAt,
        &state.TimeoutAt,
        &state.OpenedAt,
    )
    
    if err == sql.ErrNoRows {
        return nil, nil // No existe, usar defaults
    }
    
    return &state, err
}

// Circuit Breaker con persistencia
type PersistentCircuitBreaker struct {
    cb       *gobreaker.CircuitBreaker[any]
    db       *sql.DB
    serviceID string
}

func NewPersistentCircuitBreaker(db *sql.DB, serviceID string) (*PersistentCircuitBreaker, error) {
    pcb := &PersistentCircuitBreaker{
        db:        db,
        serviceID: serviceID,
    }
    
    settings := gobreaker.Settings{
        Name:        serviceID,
        MaxRequests: 3,
        Timeout:     60 * time.Second,
        ReadyToTrip: func(counts gobreakreaker.Counts) bool {
            return counts.ConsecutiveFailures >= 5
        },
        OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
            // Persistir cambio de estado
            pcb.persistState(name, from, to, counts)
        },
    }
    
    pcb.cb = gobreaker.NewCircuitBreaker[any](settings)
    
    // Cargar estado inicial desde DB
    if err := pcb.loadState(); err != nil {
        return nil, err
    }
    
    return pcb, nil
}

func (pcb *PersistentCircuitBreaker) Execute(fn func() (any, error)) (any, error) {
    result, err := pcb.cb.Execute(fn)
    
    // Actualizar contadores después de cada ejecución
    pcb.updateCounters(err)
    
    return result, err
}
```

### Recovery After Restart

```go
// Inicializar circuit breakers al startup
func initializeCircuitBreakers(db *sql.DB) (map[string]*PersistentCircuitBreaker, error) {
    breakers := make(map[string]*PersistentCircuitBreaker)
    
    // Servicios conocidos
    services := []string{"gcal", "telegram", "gmail", "postgres"}
    
    for _, serviceID := range services {
        pcb, err := NewPersistentCircuitBreaker(db, serviceID)
        if err != nil {
            return nil, fmt.Errorf("failed to create breaker for %s: %w", serviceID, err)
        }
        
        breakers[serviceID] = pcb
    }
    
    return breakers, nil
}

// Verificar y actualizar estados al startup
func recoverCircuitBreakerStates(db *sql.DB) error {
    query := `
        UPDATE circuit_breaker_state
        SET state = 'closed',
            consecutive_failures = 0,
            timeout_at = NULL
        WHERE state = 'open'
          AND timeout_at < NOW()
    `
    
    _, err := db.Exec(query)
    return err
}
```

## Umbrales y Ventanas de Tiempo

### Configuración de Thresholds

```go
// Thresholds por tipo de servicio
type CircuitBreakerConfig struct {
    ServiceID           string
    MaxRequests         int           // Requests en HALF-OPEN
    Timeout             time.Duration // Tiempo en OPEN
    ConsecutiveFailures int           // Fallos para trippear
    FailureRatio        float64       // Ratio de fallos (opcional)
    MinRequests         int           // Mínimo requests antes de evaluar ratio
}

var defaultConfigs = map[string]CircuitBreakerConfig{
    "gcal": {
        ServiceID:           "gcal",
        MaxRequests:         3,
        Timeout:             60 * time.Second,
        ConsecutiveFailures: 5,
    },
    "telegram": {
        ServiceID:           "telegram",
        MaxRequests:         5,
        Timeout:             30 * time.Second,
        ConsecutiveFailures: 10,
    },
    "gmail": {
        ServiceID:           "gmail",
        MaxRequests:         3,
        Timeout:             60 * time.Second,
        ConsecutiveFailures: 5,
    },
    "database": {
        ServiceID:           "database",
        MaxRequests:         1,
        Timeout:             10 * time.Second,
        ConsecutiveFailures: 3,
    },
}

// Configurar con failure ratio en vez de consecutivos
func createRatioBasedCircuitBreaker(serviceID string) *gobreaker.CircuitBreaker[any] {
    config := defaultConfigs[serviceID]
    
    settings := gobreaker.Settings{
        Name:        serviceID,
        MaxRequests: config.MaxRequests,
        Timeout:     config.Timeout,
        ReadyToTrip: func(counts gobreaker.Counts) bool {
            // Requiere mínimo de requests
            if counts.Requests < config.MinRequests {
                return false
            }
            
            // Evaluar ratio de fallos
            failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
            return failureRatio >= config.FailureRatio
        },
    }
    
    return gobreaker.NewCircuitBreaker[any](settings)
}
```

### Ajuste Dinámico de Thresholds

```go
// Ajustar thresholds basado en tráfico
func adaptThresholds(cb *gobreaker.CircuitBreaker[any], trafficLevel string) {
    switch trafficLevel {
    case "high":
        // Más tráfico → más tolerante
        cb.Settings().ReadyToTrip = func(counts gobreaker.Counts) bool {
            if counts.Requests < 100 {
                return false
            }
            return float64(counts.TotalFailures)/float64(counts.Requests) >= 0.3
        }
    case "low":
        // Menos tráfico → menos tolerante
        cb.Settings().ReadyToTrip = func(counts gobreaker.Counts) bool {
            return counts.ConsecutiveFailures >= 3
        }
    }
}
```

## Uso en Scripts Windmill

### Script: Circuit Breaker Check

```go
package inner

// Check estado del circuit breaker
func main(ctx context.Context, serviceID string) (map[string]any, error) {
    cb := getCircuitBreaker(serviceID)
    
    state := cb.State()
    counts := cb.Counts()
    
    return map[string]any{
        "state":                 state.String(),
        "requests":              counts.Requests,
        "total_successes":       counts.TotalSuccesses,
        "total_failures":        counts.TotalFailures,
        "consecutive_failures":  counts.ConsecutiveFailures,
        "consecutive_successes": counts.ConsecutiveSuccesses,
        "is_open":               state == gobreaker.StateOpen,
    }, nil
}
```

### Script: Circuit Breaker Record

```go
package inner

// Registrar éxito/fallo
func main(
    ctx context.Context,
    serviceID string,
    success bool,
    errorMessage string,
) (map[string]any, error) {
    db := getDatabaseConnection()
    
    if success {
        // Registrar éxito
        err := recordCircuitBreakerSuccess(db, serviceID)
        if err != nil {
            return nil, err
        }
    } else {
        // Registrar fallo
        err := recordCircuitBreakerFailure(db, serviceID, errorMessage)
        if err != nil {
            return nil, err
        }
    }
    
    // Obtener estado actualizado
    state, _ := loadCircuitBreakerState(db, serviceID)
    
    return map[string]any{
        "service_id": serviceID,
        "state":      state.State,
        "recorded":   success,
    }, nil
}

func recordCircuitBreakerSuccess(db *sql.DB, serviceID string) error {
    query := `
        INSERT INTO circuit_breaker_state (service_id, total_successes, last_success_at)
        VALUES ($1, 1, NOW())
        ON CONFLICT (service_id) DO UPDATE SET
            total_successes = circuit_breaker_state.total_successes + 1,
            consecutive_successes = circuit_breaker_state.consecutive_successes + 1,
            consecutive_failures = 0,
            last_success_at = NOW()
    `
    _, err := db.Exec(query, serviceID)
    return err
}

func recordCircuitBreakerFailure(db *sql.DB, serviceID, errorMsg string) error {
    query := `
        INSERT INTO circuit_breaker_state (
            service_id, total_failures, consecutive_failures,
            last_failure_at, state, timeout_at, opened_at
        ) VALUES ($1, 1, 1, NOW(), 'open', NOW() + INTERVAL '60 seconds', NOW())
        ON CONFLICT (service_id) DO UPDATE SET
            total_failures = circuit_breaker_state.total_failures + 1,
            consecutive_failures = circuit_breaker_state.consecutive_failures + 1,
            consecutive_successes = 0,
            last_failure_at = NOW(),
            -- Auto-trippear a open si > 5 fallos consecutivos
            state = CASE 
                WHEN circuit_breaker_state.consecutive_failures + 1 >= 5 
                THEN 'open'
                ELSE circuit_breaker_state.state
            END,
            timeout_at = CASE
                WHEN circuit_breaker_state.consecutive_failures + 1 >= 5
                THEN NOW() + INTERVAL '60 seconds'
                ELSE circuit_breaker_state.timeout_at
            END,
            opened_at = CASE
                WHEN circuit_breaker_state.consecutive_failures + 1 >= 5
                THEN NOW()
                ELSE circuit_breaker_state.opened_at
            END
        WHERE circuit_breaker_state.state != 'open' -- No actualizar si ya está open
    `
    _, err := db.Exec(query, serviceID)
    return err
}
```

### Integración con Flows de Booking

```yaml
# f/booking-orchestrator-flow__flow/flow.yaml
value:
  modules:
    # 1. Check circuit breaker antes de llamar GCal
    - id: check_gcal_circuit_breaker
      value:
        type: script
        path: f/circuit-breaker-check
        input_transforms:
          service_id:
            type: static
            value: "gcal"
    
    # 2. Skip si CB está open
    - id: gate_cb_open
      skip_if:
        expr: results.check_gcal_circuit_breaker.data?.state !== 'open'
      stop_after_if:
        expr: results.check_gcal_circuit_breaker.data?.state === 'open'
        error_message: "Google Calendar service unavailable (circuit breaker open)"
      value:
        type: rawscript
        language: bun
        content: |
          export async function main() {
            return { skip: false };
          }
    
    # 3. Llamar GCal
    - id: gcal_create_event
      value:
        type: script
        path: f/gcal-create-event
    
    # 4. Registrar éxito
    - id: record_gcal_success
      value:
        type: script
        path: f/circuit-breaker-record
        input_transforms:
          service_id:
            type: static
            value: "gcal"
          success:
            type: static
            value: true
    
    # 5. Failure handler: registrar fallo
    - id: failure
      value:
        type: rawscript
        language: bun
        content: |
          export async function main(error: any) {
            // Registrar fallo en circuit breaker
            await recordCircuitBreakerFailure("gcal", error.message);
            return { error: error.message };
          }
```

## Errores Comunes

### ❌ No Persistir Estado

```go
// MAL: Estado se pierde al reiniciar
cb := gobreaker.NewCircuitBreaker(settings)

// BIEN: Con persistencia
pcb := NewPersistentCircuitBreaker(db, serviceID)
```

### ❌ Timeout Muy Corto

```go
// MAL: 1 segundo no es suficiente para recuperación
settings.Timeout = 1 * time.Second

// BIEN: 60 segundos para servicios externos
settings.Timeout = 60 * time.Second
```

### ❌ Threshold Muy Bajo

```go
// MAL: 1 fallo y se abre (muy sensible)
settings.ReadyToTrip = func(counts Counts) bool {
    return counts.ConsecutiveFailures >= 1
}

// BIEN: 5 fallos consecutivos
settings.ReadyToTrip = func(counts Counts) bool {
    return counts.ConsecutiveFailures >= 5
}
```

### ❌ No Diferenciar Errores

```go
// MAL: Todo cuenta como fallo
settings.IsSuccessful = func(err error) bool {
    return err == nil
}

// BIEN: Ignorar errores de cliente (4xx)
settings.IsSuccessful = func(err error) bool {
    if isClientError(err) {
        return true // 4xx no cuenta como fallo del servicio
    }
    return err == nil
}
```

## Métricas a Monitorear

| Métrica | Alerta Si | Acción |
|---------|-----------|--------|
| Estado OPEN | > 5 min | Investigar servicio |
| Failure Rate | > 20% | Revisar logs del servicio |
| Consecutive Failures | > 3 | Alerta temprana |
| State Transitions | > 10/hora | Inestabilidad del servicio |
| Timeout Expirations | > 5/hora | Servicio lento |

## Checklist Producción

- [ ] Circuit breaker por servicio externo (GCal, Telegram, etc.)
- [ ] Persistencia en PostgreSQL
- [ ] Recovery de estado al restart
- [ ] Thresholds configurados por servicio
- [ ] Logging de state changes
- [ ] Monitoreo de métricas (estado, failure rate)
- [ ] Alertas cuando CB se abre
- [ ] Documentación de thresholds y timeouts
- [ ] Runbook para reset manual si es necesario
- [ ] Testing de transiciones de estado
