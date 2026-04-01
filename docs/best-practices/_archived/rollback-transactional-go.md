# Rollback Transaccional en Go para Booking Orchestrator - Best Practices

## Saga Pattern para Distributed Transactions

### Orchestration vs Choreography

| Patrón | Descripción | Cuándo Usar |
|--------|-------------|-------------|
| **Orchestration** | Orquestador central dirige cada paso y maneja compensaciones | Flujos complejos con múltiples servicios, fácil debugging |
| **Choreography** | Cada servicio publica/eventos sin coordinador central | Flujos simples, baja coordinación |

**Para Booking Orchestrator: Usar Orchestration**

```
┌─────────────────────────────────────────────────────────────┐
│              Booking Orchestrator (Saga)                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Forward Steps (en orden):                            │  │
│  │  1. Circuit Breaker Check                            │  │
│  │  2. Distributed Lock Acquire                         │  │
│  │  3. Availability Check                               │  │
│  │  4. GCal Create Event                                │  │
│  │  5. DB Create Booking                                │  │
│  │  6. Circuit Breaker Record Success                   │  │
│  │  7. Distributed Lock Release                         │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Compensation Steps (orden inverso si falla):         │  │
│  │  7. (skip - lock release no necesita compensación)   │  │
│  │  6. Circuit Breaker Record Failure                   │  │
│  │  5. DB Delete Booking (si se creó)                   │  │
│  │  4. GCal Delete Event (si se creó)                   │  │
│  │  3. (skip - availability check no tiene estado)      │  │
│  │  2. Distributed Lock Release (si se adquirió)        │  │
│  │  1. (skip - circuit breaker check no tiene estado)   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Regla de Orden de Compensación

```
✅ CORRECTO: Compensar en orden INVERSO a la ejecución
Forward:  1 → 2 → 3 → 4 → 5
Rollback: 5 → 4 → 3 → 2 → 1

❌ INCORRECTO: Compensar en mismo orden
Forward:  1 → 2 → 3 → 4 → 5
Rollback: 1 → 2 → 3 → 4 → 5  // ¡Puede causar inconsistencias!
```

**Razón:** Mantener integridad referencial
- Si paso 4 usa dato creado en paso 3
- Compensación de paso 4 debe ejecutarse ANTES que compensación de paso 3

## Implementación en Go

### Step Structure

```go
package orchestrator

import "context"

// Step representa un paso en la saga
type Step struct {
    Name       string
    Action     func(ctx context.Context, data map[string]interface{}) error
    Compensate func(ctx context.Context, data map[string]interface{}) error
}

// Saga representa el orchestrator completo
type Saga struct {
    Name   string
    Steps  []Step
}

// SagaResult representa el resultado de la ejecución
type SagaResult struct {
    Success        bool
    CompletedSteps []string
    FailedStep     string
    Error          error
}

// New crea una nueva saga
func New(name string) *Saga {
    return &Saga{
        Name:  name,
        Steps: []Step{},
    }
}

// AddStep agrega un paso a la saga
func (s *Saga) AddStep(step Step) *Saga {
    s.Steps = append(s.Steps, step)
    return s
}
```

### Execute con Rollback

```go
func (s *Saga) Execute(ctx context.Context, initialData map[string]interface{}) *SagaResult {
    completedSteps := make([]string, 0)
    
    for i, step := range s.Steps {
        // Ejecutar acción forward
        if err := step.Action(ctx, initialData); err != nil {
            // Falló: ejecutar compensaciones en orden inverso
            s.rollback(ctx, completedSteps, initialData, step.Name, err)
            
            return &SagaResult{
                Success:        false,
                CompletedSteps: completedSteps,
                FailedStep:     step.Name,
                Error:          err,
            }
        }
        
        // Marcar paso como completado
        completedSteps = append(completedSteps, step.Name)
        
        // Loggear éxito
        log.Printf("Step %d/%d completed: %s", i+1, len(s.Steps), step.Name)
    }
    
    return &SagaResult{
        Success:        true,
        CompletedSteps: completedSteps,
    }
}

// rollback ejecuta compensaciones en orden inverso
func (s *Saga) rollback(
    ctx context.Context,
    completedSteps []string,
    data map[string]interface{},
    failedStep string,
    originalErr error,
) {
    // Crear mapa de pasos por nombre
    stepMap := make(map[string]Step)
    for _, step := range s.Steps {
        stepMap[step.Name] = step
    }
    
    log.Printf("Starting rollback for failed step: %s", failedStep)
    
    // Ejecutar compensaciones en orden INVERSO
    for i := len(completedSteps) - 1; i >= 0; i-- {
        stepName := completedSteps[i]
        step := stepMap[stepName]
        
        if step.Compensate == nil {
            log.Printf("Skipping compensation for %s (no compensation defined)", stepName)
            continue
        }
        
        // Ejecutar compensación
        log.Printf("Compensating step: %s", stepName)
        if err := step.Compensate(ctx, data); err != nil {
            // Loggear error de compensación pero continuar
            log.Printf("ERROR: Compensation failed for %s: %v", stepName, err)
            
            // Agregar a DLQ para retry manual
            addToDLQ(ctx, DLQEntry{
                Operation:   fmt.Sprintf("compensate_%s", stepName),
                Payload:     data,
                Error:       err.Error(),
                RetryCount:  0,
                MaxRetries:  3,
            })
        }
    }
    
    log.Printf("Rollback completed for failed step: %s", failedStep)
}
```

## Booking Orchestrator Implementation

### Forward Steps

```go
// f/booking_orchestrator/main.go
package inner

import (
    "booking-titanium-wm/internal/booking"
    "booking-titanium-wm/internal/infrastructure"
    "context"
)

func main(
    ctx context.Context,
    providerID int,
    serviceID int,
    startTime string,
    endTime string,
    chatID string,
    userName string,
    userEmail string,
) (map[string]any, error) {
    // Datos compartidos entre pasos
    data := map[string]interface{}{
        "provider_id": providerID,
        "service_id":  serviceID,
        "start_time":  startTime,
        "end_time":    endTime,
        "chat_id":     chatID,
        "user_name":   userName,
        "user_email":  userEmail,
    }
    
    // Crear saga
    saga := New("booking-orchestrator").
        AddStep(Step{
            Name:       "circuit_breaker_check",
            Action:     circuitBreakerCheckAction,
            Compensate: nil, // No compensation needed
        }).
        AddStep(Step{
            Name:       "distributed_lock_acquire",
            Action:     distributedLockAcquireAction,
            Compensate: distributedLockReleaseCompensation,
        }).
        AddStep(Step{
            Name:       "availability_check",
            Action:     availabilityCheckAction,
            Compensate: nil, // No state changed
        }).
        AddStep(Step{
            Name:       "gcal_create_event",
            Action:     gcalCreateEventAction,
            Compensate: gcalDeleteEventCompensation,
        }).
        AddStep(Step{
            Name:       "db_create_booking",
            Action:     dbCreateBookingAction,
            Compensate: dbDeleteBookingCompensation,
        }).
        AddStep(Step{
            Name:       "circuit_breaker_record",
            Action:     circuitBreakerRecordAction,
            Compensate: circuitBreakerRecordFailureCompensation,
        }).
        AddStep(Step{
            Name:       "distributed_lock_release",
            Action:     distributedLockReleaseAction,
            Compensate: nil, // Already released
        })
    
    // Ejecutar saga
    result := saga.Execute(ctx, data)
    
    if !result.Success {
        return map[string]any{
            "success":     false,
            "error":       result.Error.Error(),
            "failed_step": result.FailedStep,
            "rollback":    "completed",
        }, nil
    }
    
    return map[string]any{
        "success": true,
        "data": map[string]any{
            "booking_id":   data["booking_id"],
            "gcal_event_id": data["gcal_event_id"],
            "lock_released": true,
        },
    }, nil
}
```

### Compensation Functions

```go
// Circuit Breaker Check
func circuitBreakerCheckAction(ctx context.Context, data map[string]interface{}) error {
    serviceID := "gcal"
    result := infrastructure.Check(serviceID)
    
    if !result.Success || result.Data["state"] == "open" {
        return fmt.Errorf("circuit breaker is open for %s", serviceID)
    }
    
    data["circuit_breaker_checked"] = true
    return nil
}

// Distributed Lock Acquire
func distributedLockAcquireAction(ctx context.Context, data map[string]interface{}) error {
    providerID := data["provider_id"].(int)
    startTime := data["start_time"].(string)
    
    result := infrastructure.AcquireLock(ctx, providerID, startTime, 5*time.Minute)
    if !result.Success {
        return fmt.Errorf("failed to acquire lock: %v", result.Error)
    }
    
    data["lock_key"] = result.Data["lock_key"]
    data["owner_token"] = result.Data["owner_token"]
    return nil
}

func distributedLockReleaseCompensation(ctx context.Context, data map[string]interface{}) error {
    // Solo compensar si lock fue adquirido
    if data["owner_token"] == nil {
        return nil
    }
    
    providerID := data["provider_id"].(int)
    startTime := data["start_time"].(string)
    ownerToken := data["owner_token"].(string)
    
    result := infrastructure.ReleaseLock(ctx, providerID, startTime, ownerToken)
    if !result.Success {
        return fmt.Errorf("failed to release lock: %v", result.Error)
    }
    
    log.Printf("Lock released successfully: %s", data["lock_key"])
    return nil
}

// Availability Check
func availabilityCheckAction(ctx context.Context, data map[string]interface{}) error {
    providerID := data["provider_id"].(int)
    serviceID := data["service_id"].(int)
    startTime := data["start_time"].(string)
    
    result := checkAvailability(ctx, providerID, serviceID, startTime)
    if !result.Available {
        return fmt.Errorf("time slot not available")
    }
    
    return nil
}

// GCal Create Event
func gcalCreateEventAction(ctx context.Context, data map[string]interface{}) error {
    providerID := data["provider_id"].(int)
    startTime := data["start_time"].(string)
    endTime := data["end_time"].(string)
    userName := data["user_name"].(string)
    
    result := createGCalEvent(ctx, providerID, startTime, endTime, userName)
    if !result.Success {
        return fmt.Errorf("failed to create GCal event: %v", result.Error)
    }
    
    data["gcal_event_id"] = result.Data["event_id"]
    return nil
}

func gcalDeleteEventCompensation(ctx context.Context, data map[string]interface{}) error {
    // Solo compensar si evento fue creado
    if data["gcal_event_id"] == nil {
        return nil
    }
    
    eventID := data["gcal_event_id"].(string)
    
    result := deleteGCalEvent(ctx, eventID)
    if !result.Success {
        return fmt.Errorf("failed to delete GCal event: %v", result.Error)
    }
    
    log.Printf("GCal event deleted: %s", eventID)
    return nil
}

// DB Create Booking
func dbCreateBookingAction(ctx context.Context, data map[string]interface{}) error {
    bookingData := booking.CreateBookingRequest{
        ProviderID:   data["provider_id"].(int),
        ServiceID:    data["service_id"].(int),
        StartTime:    data["start_time"].(string),
        EndTime:      data["end_time"].(string),
        ChatID:       data["chat_id"].(string),
        UserName:     data["user_name"].(string),
        UserEmail:    data["user_email"].(string),
        GCalEventID:  data["gcal_event_id"].(string),
    }
    
    result, err := booking.CreateBooking(ctx, bookingData)
    if err != nil {
        return fmt.Errorf("failed to create booking: %w", err)
    }
    
    data["booking_id"] = result.ID
    return nil
}

func dbDeleteBookingCompensation(ctx context.Context, data map[string]interface{}) error {
    // Solo compensar si booking fue creado
    if data["booking_id"] == nil {
        return nil
    }
    
    bookingID := data["booking_id"].(string)
    
    _, err := booking.CancelBooking(ctx, bookingID, "Rollback due to orchestration failure")
    if err != nil {
        return fmt.Errorf("failed to cancel booking: %w", err)
    }
    
    log.Printf("Booking cancelled: %s", bookingID)
    return nil
}

// Circuit Breaker Record
func circuitBreakerRecordAction(ctx context.Context, data map[string]interface{}) error {
    serviceID := "gcal"
    result := infrastructure.RecordSuccess(ctx, serviceID)
    
    if !result.Success {
        return fmt.Errorf("failed to record circuit breaker success: %v", result.Error)
    }
    
    return nil
}

func circuitBreakerRecordFailureCompensation(ctx context.Context, data map[string]interface{}) error {
    serviceID := "gcal"
    result := infrastructure.RecordFailure(ctx, serviceID, "Orchestration rollback")
    
    if !result.Success {
        return fmt.Errorf("failed to record circuit breaker failure: %v", result.Error)
    }
    
    return nil
}

// Distributed Lock Release (final step)
func distributedLockReleaseAction(ctx context.Context, data map[string]interface{}) error {
    providerID := data["provider_id"].(int)
    startTime := data["start_time"].(string)
    ownerToken := data["owner_token"].(string)
    
    result := infrastructure.ReleaseLock(ctx, providerID, startTime, ownerToken)
    if !result.Success {
        return fmt.Errorf("failed to release lock: %v", result.Error)
    }
    
    log.Printf("Lock released successfully at end of flow")
    return nil
}
```

## Logging y Auditoría

### Structured Logging

```go
import "go.uber.org/zap"

var logger *zap.Logger

func init() {
    logger, _ = zap.NewProduction()
}

// Log con contexto de transacción
func logStepStart(stepName string, data map[string]interface{}) {
    logger.Info("Step started",
        zap.String("step", stepName),
        zap.String("saga", "booking-orchestrator"),
        zap.Int("provider_id", data["provider_id"].(int)),
        zap.String("start_time", data["start_time"].(string)),
        zap.String("chat_id", data["chat_id"].(string)),
    )
}

func logStepSuccess(stepName string, data map[string]interface{}) {
    logger.Info("Step completed",
        zap.String("step", stepName),
        zap.String("saga", "booking-orchestrator"),
    )
}

func logStepFailure(stepName string, err error, data map[string]interface{}) {
    logger.Error("Step failed",
        zap.String("step", stepName),
        zap.String("saga", "booking-orchestrator"),
        zap.Error(err),
        zap.Stack("stack"),
    )
}

func logCompensationStart(stepName string) {
    logger.Info("Compensation started",
        zap.String("step", stepName),
        zap.String("saga", "booking-orchestrator"),
    )
}

func logCompensationSuccess(stepName string) {
    logger.Info("Compensation completed",
        zap.String("step", stepName),
        zap.String("saga", "booking-orchestrator"),
    )
}

func logCompensationFailure(stepName string, err error) {
    logger.Error("Compensation failed",
        zap.String("step", stepName),
        zap.String("saga", "booking-orchestrator"),
        zap.Error(err),
        zap.Stack("stack"),
    )
}
```

### Audit Trail

```go
type AuditEntry struct {
    Timestamp   time.Time         `json:"timestamp"`
    SagaID      string            `json:"saga_id"`
    StepName    string            `json:"step_name"`
    Action      string            `json:"action"` // "forward" | "compensate"
    Status      string            `json:"status"` // "success" | "failure"
    Error       string            `json:"error,omitempty"`
    Data        map[string]interface{} `json:"data,omitempty"`
    DurationMs  int64             `json:"duration_ms"`
}

func logAudit(entry AuditEntry) {
    // Guardar en DB para auditoría
    query := `
        INSERT INTO audit_trail (
            timestamp, saga_id, step_name, action, status,
            error, data, duration_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `
    
    _, err := db.ExecContext(context.Background(), query,
        entry.Timestamp,
        entry.SagaID,
        entry.StepName,
        entry.Action,
        entry.Status,
        entry.Error,
        toJSON(entry.Data),
        entry.DurationMs,
    )
    
    if err != nil {
        logger.Error("Failed to log audit entry", zap.Error(err))
    }
}
```

## DLQ Integration

### Agregar Fallos de Compensación a DLQ

```go
type DLQEntry struct {
    Operation   string                 `json:"operation"`
    Payload     map[string]interface{} `json:"payload"`
    Error       string                 `json:"error"`
    RetryCount  int                    `json:"retry_count"`
    MaxRetries  int                    `json:"max_retries"`
    NextRetryAt time.Time              `json:"next_retry_at"`
}

func addToDLQ(ctx context.Context, entry DLQEntry) {
    query := `
        INSERT INTO dlq_entries (
            operation, payload, error_reason,
            retry_count, max_retries, next_retry_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
    `
    
    _, err := db.ExecContext(ctx, query,
        entry.Operation,
        toJSON(entry.Payload),
        entry.Error,
        entry.RetryCount,
        entry.MaxRetries,
        entry.NextRetryAt,
    )
    
    if err != nil {
        logger.Error("Failed to add entry to DLQ",
            zap.Error(err),
            zap.String("operation", entry.Operation),
        )
    } else {
        logger.Info("Entry added to DLQ",
            zap.String("operation", entry.Operation),
        )
    }
}

// En rollback, cuando compensación falla
if err := step.Compensate(ctx, data); err != nil {
    logCompensationFailure(step.Name, err)
    
    // Agregar a DLQ para retry manual
    addToDLQ(ctx, DLQEntry{
        Operation:   fmt.Sprintf("compensate_%s", step.Name),
        Payload:     data,
        Error:       err.Error(),
        RetryCount:  0,
        MaxRetries:  3,
        NextRetryAt: time.Now().Add(5 * time.Minute),
    })
}
```

## Windmill Flow Integration

### Failure Handler en Flow YAML

```yaml
# f/booking_orchestrator_flow__flow/flow.yaml
summary: Booking Orchestrator Flow with Rollback
value:
  modules:
    # ... pasos normales ...
    
    # Failure Handler (se ejecuta si algún paso falla)
    - id: failure
      summary: Rollback and DLQ on error
      value:
        type: rawscript
        language: go
        content: |
          package inner
          
          import (
              "booking-titanium-wm/internal/dlq"
              "context"
          )
          
          func main(
              ctx context.Context,
              error map[string]any,
              results map[string]any,
              flow_input map[string]any,
          ) (map[string]any, error) {
              // Log error
              log.Printf("Flow failed at step: %s", error["step_id"])
              log.Printf("Error: %v", error["message"])
              
              // Ejecutar compensaciones manuales si es necesario
              if results["gcal_create_event"] != nil && results["gcal_create_event"].data != nil {
                  eventID := results["gcal_create_event"].data["event_id"]
                  deleteGCalEvent(ctx, eventID)
                  log.Printf("GCal event deleted: %s", eventID)
              }
              
              if results["distributed_lock_acquire"] != nil && results["distributed_lock_acquire"].data != nil {
                  ownerToken := results["distributed_lock_acquire"].data["owner_token"]
                  providerID := flow_input["provider_id"]
                  startTime := flow_input["start_time"]
                  releaseLock(ctx, providerID, startTime, ownerToken)
                  log.Printf("Lock released")
              }
              
              // Agregar a DLQ para revisión manual
              dlq.AddEntry(ctx, dlq.Entry{
                  Operation: "booking_orchestrator_failure",
                  Payload:   flow_input,
                  Error:     error["message"].(string),
                  Metadata: map[string]any{
                      "failed_step": error["step_id"],
                      "results":     results,
                  },
              })
              
              return map[string]any{
                  "rollback": "completed",
                  "dlq":      "entry_added",
              }, nil
          }
```

## Errores Comunes

### ❌ Compensar en Orden Incorrecto

```go
// MAL: Compensar en mismo orden que forward
func rollback(steps []Step) {
    for i := 0; i < len(steps); i++ {
        steps[i].Compensate() // ¡Orden incorrecto!
    }
}

// BIEN: Compensar en orden inverso
func rollback(steps []Step) {
    for i := len(steps) - 1; i >= 0; i-- {
        steps[i].Compensate()
    }
}
```

### ❌ No Verificar si Paso se Ejecutó

```go
// MAL: Compensar siempre
func gcalDeleteEventCompensation(ctx context.Context, data map[string]interface{}) error {
    eventID := data["gcal_event_id"].(string) // ¡Puede ser nil!
    return deleteGCalEvent(ctx, eventID)
}

// BIEN: Verificar si se ejecutó
func gcalDeleteEventCompensation(ctx context.Context, data map[string]interface{}) error {
    if data["gcal_event_id"] == nil {
        return nil // Skip - evento nunca se creó
    }
    eventID := data["gcal_event_id"].(string)
    return deleteGCalEvent(ctx, eventID)
}
```

### ❌ Ignorar Errores de Compensación

```go
// MAL: Ignorar error
func rollback(steps []Step) {
    for i := len(steps) - 1; i >= 0; i-- {
        steps[i].Compensate() // Error ignorado!
    }
}

// BIEN: Loggear y agregar a DLQ
func rollback(ctx context.Context, steps []Step, data map[string]interface{}) {
    for i := len(steps) - 1; i >= 0; i-- {
        if err := steps[i].Compensate(ctx, data); err != nil {
            logCompensationFailure(steps[i].Name, err)
            addToDLQ(ctx, DLQEntry{
                Operation: fmt.Sprintf("compensate_%s", steps[i].Name),
                Payload:   data,
                Error:     err.Error(),
            })
        }
    }
}
```

### ❌ No Hacer Compensaciones Idempotentes

```go
// MAL: Falla si ya se compensó
func dbDeleteBookingCompensation(ctx context.Context, data map[string]interface{}) error {
    bookingID := data["booking_id"].(string)
    _, err := db.Exec("DELETE FROM bookings WHERE id = $1", bookingID)
    // ¡Fallará la segunda vez!
    return err
}

// BIEN: Idempotente
func dbDeleteBookingCompensation(ctx context.Context, data map[string]interface{}) error {
    bookingID := data["booking_id"].(string)
    _, err := db.Exec(`
        UPDATE bookings SET status = 'CANCELLED' 
        WHERE id = $1 AND status != 'CANCELLED'
    `, bookingID)
    // No falla si ya está cancelado
    return err
}
```

## Checklist Producción

- [ ] Saga pattern implementado con orchestration
- [ ] Compensaciones definidas para cada paso con estado
- [ ] Rollback en orden inverso garantizado
- [ ] Compensaciones idempotentes
- [ ] Logging estructurado (zap/logrus)
- [ ] Audit trail en DB
- [ ] DLQ para compensaciones fallidas
- [ ] Failure handler en Windmill flow
- [ ] Alertas para compensaciones fallidas
- [ ] Runbook para retry manual desde DLQ
- [ ] Tests de rollback (fallar en cada paso)
