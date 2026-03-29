# Flows en Windmill - Best Practices

## Estructura de Flow YAML

### Schema Completo

```yaml
# f/booking-orchestrator-flow__flow/flow.yaml
summary: Booking Orchestrator Flow
description: |
  Orquesta el flujo completo de creación de reservas.
  Maneja circuit breaker, distributed lock, GCal, DB y rollback.

schema:
  type: object
  properties:
    provider_id:
      type: integer
      description: ID del proveedor
    service_id:
      type: integer
      description: ID del servicio
    start_time:
      type: string
      format: date-time
    chat_id:
      type: string
    user_name:
      type: string
    user_email:
      type: string
  required:
    - provider_id
    - service_id
    - start_time
    - chat_id

value:
  modules:
    # Módulo 1: Script existente
    - id: check_circuit_breaker
      summary: Verificar estado del circuit breaker
      value:
        type: script
        path: f/circuit-breaker-check
        input_transforms:
          service_id:
            type: static
            value: "gcal"
    
    # Módulo 2: Script con input dinámico
    - id: acquire_lock
      summary: Adquirir lock distribuido
      value:
        type: script
        path: f/distributed-lock-acquire
        input_transforms:
          provider_id:
            type: javascript
            expr: flow_input.provider_id
          start_time:
            type: javascript
            expr: flow_input.start_time
          duration_minutes:
            type: static
            value: 5
    
    # Módulo 3: Condicional con skip_if
    - id: check_availability
      summary: Verificar disponibilidad
      skip_if:
        expr: results.check_circuit_breaker.data?.state === 'open'
      value:
        type: script
        path: f/availability-check
        input_transforms:
          provider_id:
            type: javascript
            expr: flow_input.provider_id
          service_id:
            type: javascript
            expr: flow_input.service_id
    
    # Módulo 4: Branch One (condicional)
    - id: branch_by_intent
      summary: Branch según tipo de booking
      value:
        type: branchone
        branches:
          - predicate:
              type: javascript
              expr: flow_input.service_id === 1
            modules:
              - id: create_premium_booking
                value:
                  type: script
                  path: f/booking-create-premium
            summary: Premium booking
          - predicate:
              type: javascript
              expr: flow_input.service_id === 2
            modules:
              - id: create_standard_booking
                value:
                  type: script
                  path: f/booking-create-standard
            summary: Standard booking
        default:
          - id: create_basic_booking
            value:
              type: script
              path: f/booking-create-basic
    
    # Módulo 5: Failure handler (rollback)
    - id: failure
      summary: Rollback on error
      value:
        type: rawscript
        language: bun
        content: |
          export async function main(error: any, results: any, flow_input: any) {
            const rollbacks = [];
            
            // Rollback GCal
            if (results.gcal_create_event?.data?.event_id) {
              rollbacks.push(
                deleteGCalEvent(results.gcal_create_event.data.event_id)
              );
            }
            
            // Rollback Lock
            if (results.distributed_lock_acquire?.data?.owner_token) {
              rollbacks.push(
                releaseLock(
                  flow_input.provider_id,
                  flow_input.start_time,
                  results.distributed_lock_acquire.data.owner_token
                )
              );
            }
            
            await Promise.all(rollbacks);
            
            return {
              error: error.message,
              failed_step: error.step_id,
              rollback: 'completed'
            };
          }
        input_transforms:
          error:
            type: javascript
            expr: flow_input.error
          results:
            type: javascript
            expr: flow_input.results
          flow_input:
            type: javascript
            expr: flow_input

flow_env:
  DATABASE_URL: $res:f/resources/booking-db
  GROQ_API_KEY: $var:GROQ_API_KEY
```

## Composición de Pasos

### Tipos de Módulos

| Tipo | Cuándo Usar | Ejemplo |
|------|-------------|---------|
| **script** | Llamar script existente | `type: script, path: f/my-script` |
| **flow** | Sub-flow (anidado) | `type: flow, path: f/sub-flow__flow` |
| **rawscript** | Código inline | `type: rawscript, language: bun, content: \|` |
| **branchone** | Switch/Case (un camino) | `type: branchone, branches: [...]` |
| **branchall** | Paralelo (todos los caminos) | `type: branchall, branches: [...]` |
| **forloopflow** | Iterar array | `type: forloopflow, iterator: {...}` |

### Input Transforms

```yaml
# Estático (valor fijo)
input_transforms:
  service_id:
    type: static
    value: "gcal"

# JavaScript (dinámico de flow_input)
input_transforms:
  provider_id:
    type: javascript
    expr: flow_input.provider_id

# JavaScript (de paso anterior)
input_transforms:
  event_id:
    type: javascript
    expr: results.gcal_create_event.data.event_id

# JavaScript (expresión compleja)
input_transforms:
  formatted_time:
    type: javascript
    expr: |
      new Date(flow_input.start_time)
        .toISOString()
        .replace('Z', '+00:00')

# Referencia a recurso
input_transforms:
  database:
    type: static
    value: "$res:f/resources/booking-db"

# Referencia a variable
input_transforms:
  api_key:
    type: static
    value: "$var:GROQ_API_KEY"
```

### Data Flow Between Steps

```javascript
// flow_input.*       → Input del flow (definido en schema)
// results.step_id.*  → Output de paso anterior
// flow_env.*         → Variables de entorno del flow
// $res:path          → Recurso
// $var:NAME          → Variable

// Ejemplos:
flow_input.provider_id
results.previous_step.data.booking_id
flow_env.DATABASE_URL
results.step1.data.items.length
```

## Manejo de Errores por Step

### Retry Configuration

```yaml
- id: call_external_api
  value:
    type: script
    path: f/gcal-create-event
  retry:
    # Retry constante
    constant:
      attempts: 3
      seconds: 2
    
    # O retry exponencial (backoff)
    exponential:
      attempts: 3
      seconds: 1        # Delay inicial
      multiplier: 2     # Dobla cada intento
      random_factor: 50 # Jitter 0-50%
    
    # Condición para reintentar
    retry_if:
      expr: |
        error?.message?.includes('timeout') ||
        error?.code === 503
```

### Continue on Error

```yaml
- id: send_notification
  continue_on_error: true  # Si falla, continuar al siguiente paso
  value:
    type: script
    path: f/telegram-send
```

### Stop After If (Terminación Temprana)

```yaml
- id: validate_input
  stop_after_if:
    expr: !results.validate_input.success
    error_message: "Validación fallida: datos incompletos"
  value:
    type: script
    path: f/validate-booking-input

# Este paso se saltea si el anterior falló
- id: create_booking
  skip_if:
    expr: !results.validate_input.success
  value:
    type: script
    path: f/booking-create
```

### Failure Module (Handler Global)

```yaml
# Al final del flow, se ejecuta si hay error
- id: failure
  summary: Error handler con rollback
  value:
    type: rawscript
    language: bun
    content: |
      export async function main(error: any, results: any, flow_input: any) {
        // error.message   → Mensaje de error
        // error.step_id   → ID del paso que falló
        // error.name      → Nombre del error
        // error.stack     → Stack trace
        // results.*       → Resultados de pasos anteriores
        
        console.error(`Error in step ${error.step_id}: ${error.message}`);
        
        // Rollback logic aquí
        return { error: error.message, rollback: 'completed' };
      }
```

## Branching Condicional

### Branch One (Switch/Case)

```yaml
- id: branch_by_status
  summary: Branch según estado
  value:
    type: branchone
    branches:
      # Rama 1: Estado = confirmed
      - predicate:
          type: javascript
          expr: results.check_status.data.status === 'confirmed'
        modules:
          - id: send_confirmation
            value:
              type: script
              path: f/send-confirmation
        summary: Send confirmation
        
      # Rama 2: Estado = pending
      - predicate:
          type: javascript
          expr: results.check_status.data.status === 'pending'
        modules:
          - id: request_approval
            value:
              type: script
              path: f/request-approval
        summary: Request approval
        
      # Rama 3: Estado = cancelled
      - predicate:
          type: javascript
          expr: results.check_status.data.status === 'cancelled'
        modules:
          - id: log_cancellation
            value:
              type: script
              path: f/log-cancellation
        summary: Log cancellation
    
    # Default si ningún predicate es true
    default:
      - id: handle_unknown_status
        value:
          type: script
          path: f/handle-unknown-status
```

### Branch All (Paralelo)

```yaml
- id: send_all_notifications
  summary: Enviar notificaciones en paralelo
  value:
    type: branchall
    skip_failures: true  # Si una rama falla, continuar con las demás
    branches:
      - predicate:
          type: javascript
          expr: true  # Siempre ejecuta
        modules:
          - id: send_telegram
            value:
              type: script
              path: f/telegram-send
        summary: Telegram
        
      - predicate:
          type: javascript
          expr: true
        modules:
          - id: send_email
            value:
              type: script
              path: f/gmail-send
        summary: Email
        
      - predicate:
          type: javascript
          expr: true
        modules:
          - id: send_sms
            value:
              type: script
              path: f/sms-send
        summary: SMS
```

### Skip If (Omitir Paso)

```yaml
- id: check_circuit_breaker
  value:
    type: script
    path: f/circuit-breaker-check

# Se saltea si CB está open
- id: proceed_if_cb_ok
  skip_if:
    expr: results.check_circuit_breaker.data?.state === 'open'
  value:
    type: script
    path: f/create-booking
```

## Suspend/Resume (Approval Steps)

### Configuración de Suspend

```yaml
- id: request_approval
  summary: Esperar aprobación de booking
  suspend:
    required_events: 1          # Aprobaciones necesarias
    timeout: 3600               # Timeout en segundos (1 hora)
    user_auth_required: true    # Requiere usuario autenticado
    self_approval_disabled: false  # Permite auto-aprobación
    hide_cancel: false          # Muestra botón de cancelar
    continue_on_disapprove_timeout: false  # Cancela si timeout
    
    # Formulario para aprobar/rechazar
    resume_form:
      schema:
        type: object
        properties:
          approved:
            type: boolean
            description: Aprobar booking?
          reason:
            type: string
            description: Razón si es rechazado
        required:
          - approved
  value:
    type: rawscript
    language: bun
    content: |
      export async function main() {
        // Obtener URLs de aprobación
        const urls = await wmill.getResumeUrls();
        
        // Enviar URL por email/Slack/Telegram
        await sendApprovalRequest({
          approval_url: urls.approvalPage,
          resume_url: urls.resume,
          cancel_url: urls.cancel
        });
        
        return { status: 'waiting_approval', urls };
      }
```

### Enviar URL de Aprobación

```typescript
// TypeScript
const urls = wmill.getResumeUrls();

// Email
await sendEmail({
  to: 'manager@example.com',
  subject: 'Approval Required',
  body: `
    <a href="${urls.approvalPage}">Approve in UI</a>
    <a href="${urls.resume}">Resume Flow</a>
    <a href="${urls.cancel}">Cancel Flow</a>
  `
});

// Slack
await sendSlack({
  channel: '#approvals',
  blocks: [
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve' },
          url: urls.resume
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Cancel' },
          url: urls.cancel
        }
      ]
    }
  ]
});
```

## Idempotencia en Flows

### Patrón: Idempotency Key

```yaml
# Flow input con idempotency key
schema:
  type: object
  properties:
    idempotency_key:
      type: string
      description: Unique key para deduplicar
    provider_id:
      type: integer
    # ...

value:
  modules:
    # Paso 1: Verificar idempotency
    - id: check_idempotency
      value:
        type: script
        path: f/check-idempotency-key
        input_transforms:
          idempotency_key:
            type: javascript
            expr: flow_input.idempotency_key
    
    # Paso 2: Skip si ya existe
    - id: create_booking
      skip_if:
        expr: results.check_idempotency.data?.exists === true
      value:
        type: script
        path: f/booking-create
    
    # Paso 3: Retornar existente si ya fue creado
    - id: return_existing
      skip_if:
        expr: !results.check_idempotency.data?.exists
      value:
        type: rawscript
        language: bun
        content: |
          export async function main(existing: any) {
            return {
              success: true,
              data: existing,
              idempotent: true
            };
          }
        input_transforms:
          existing:
            type: javascript
            expr: results.check_idempotency.data.booking
```

### Generar Idempotency Key

```go
// Script Go para generar key
func main(
    provider_id int,
    service_id int,
    start_time string,
    chat_id string,
) (map[string]any, error) {
    // SHA256(provider + service + time + chat)
    key := fmt.Sprintf("%d:%d:%s:%s", provider_id, service_id, start_time, chat_id)
    hash := sha256.Sum256([]byte(key))
    
    return map[string]any{
        "idempotency_key": hex.EncodeToString(hash[:]),
    }, nil
}
```

### Ventana de Deduplicación

```sql
-- Tabla de idempotency keys
CREATE TABLE idempotency_keys (
    key VARCHAR(64) PRIMARY KEY,
    booking_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);
CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);

-- Limpieza automática
DELETE FROM idempotency_keys WHERE expires_at < NOW();
```

## Orquestación de Booking Workflows

### Flow Completo de Booking

```yaml
summary: Complete Booking Flow
description: Orquestación end-to-end de creación de reservas

schema:
  type: object
  properties:
    provider_id: { type: integer }
    service_id: { type: integer }
    start_time: { type: string, format: date-time }
    chat_id: { type: string }
    user_name: { type: string }
    user_email: { type: string }
  required: [provider_id, service_id, start_time, chat_id]

value:
  modules:
    # 1. Circuit Breaker Check
    - id: circuit_breaker_check
      retry:
        constant:
          attempts: 2
          seconds: 1
      value:
        type: script
        path: f/circuit-breaker-check
        input_transforms:
          service_id:
            type: static
            value: "gcal"
    
    # 2. Skip si CB open
    - id: gate_cb_open
      skip_if:
        expr: results.circuit_breaker_check.data?.state !== 'open'
      stop_after_if:
        expr: results.circuit_breaker_check.data?.state === 'open'
        error_message: "Service unavailable (circuit breaker open)"
      value:
        type: rawscript
        language: bun
        content: |
          export async function main() {
            return { skip: false };
          }
    
    # 3. Distributed Lock
    - id: distributed_lock_acquire
      value:
        type: script
        path: f/distributed-lock-acquire
        input_transforms:
          provider_id:
            type: javascript
            expr: flow_input.provider_id
          start_time:
            type: javascript
            expr: flow_input.start_time
          duration_minutes:
            type: static
            value: 5
    
    # 4. Availability Check
    - id: availability_check
      value:
        type: script
        path: f/availability-check
        input_transforms:
          provider_id:
            type: javascript
            expr: flow_input.provider_id
          service_id:
            type: javascript
            expr: flow_input.service_id
          start_time:
            type: javascript
            expr: flow_input.start_time
    
    # 5. GCal Create Event
    - id: gcal_create_event
      retry:
        exponential:
          attempts: 3
          seconds: 1
          multiplier: 2
      value:
        type: script
        path: f/gcal-create-event
        input_transforms:
          provider_id:
            type: javascript
            expr: flow_input.provider_id
          start_time:
            type: javascript
            expr: flow_input.start_time
          user_name:
            type: javascript
            expr: flow_input.user_name
    
    # 6. Record CB Success
    - id: circuit_breaker_record
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
    
    # 7. DB Create Booking
    - id: db_create_booking
      value:
        type: script
        path: f/booking-create
        input_transforms:
          provider_id:
            type: javascript
            expr: flow_input.provider_id
          service_id:
            type: javascript
            expr: flow_input.service_id
          start_time:
            type: javascript
            expr: flow_input.start_time
          gcal_event_id:
            type: javascript
            expr: results.gcal_create_event.data?.event_id
    
    # 8. Release Lock
    - id: distributed_lock_release
      value:
        type: script
        path: f/distributed-lock-release
        input_transforms:
          provider_id:
            type: javascript
            expr: flow_input.provider_id
          start_time:
            type: javascript
            expr: flow_input.start_time
          owner_token:
            type: javascript
            expr: results.distributed_lock_acquire.data?.owner_token
    
    # 9. Send Confirmation
    - id: send_telegram_confirmation
      continue_on_error: true  # No fallar si Telegram falla
      value:
        type: script
        path: f/telegram-send
        input_transforms:
          chat_id:
            type: javascript
            expr: flow_input.chat_id
          text:
            type: javascript
            expr: |
              `✅ Reserva Confirmada\n\n` +
              `ID: ${results.db_create_booking.data?.id}\n` +
              `Proveedor: ${flow_input.user_name}\n` +
              `Fecha: ${flow_input.start_time}`
    
    # Failure Handler: Rollback
    - id: failure
      value:
        type: rawscript
        language: bun
        content: |
          export async function main(error: any, results: any, flow_input: any) {
            const rollbacks = [];
            
            // Rollback GCal
            if (results.gcal_create_event?.data?.event_id) {
              rollbacks.push(deleteGCal(results.gcal_create_event.data.event_id));
            }
            
            // Rollback Lock
            if (results.distributed_lock_acquire?.data?.owner_token) {
              rollbacks.push(releaseLock(
                flow_input.provider_id,
                flow_input.start_time,
                results.distributed_lock_acquire.data.owner_token
              ));
            }
            
            await Promise.all(rollbacks);
            
            // Log a DLQ
            await logToDLQ({
              error: error.message,
              step: error.step_id,
              input: flow_input
            });
            
            return { error: error.message, rollback: 'completed' };
          }
```

## Errores Comunes

### ❌ Module IDs Duplicados

```yaml
# MAL: IDs duplicados
modules:
  - id: step1
  - id: step1  # Error!

# BIEN: IDs únicos
modules:
  - id: step1
  - id: step2
```

### ❌ Referenciar Paso Futuro

```yaml
# MAL: step2 aún no existe
modules:
  - id: step1
    input_transforms:
      data:
        type: javascript
        expr: results.step2.data  # Error!
  - id: step2

# BIEN: Orden correcto
modules:
  - id: step2
  - id: step1
    input_transforms:
      data:
        type: javascript
        expr: results.step2.data
```

### ❌ Missing input_transforms

```yaml
# MAL: Sin input_transforms
- id: my_script
  value:
    type: script
    path: f/my-script
    # El script no recibe parámetros!

# BIEN: Con input_transforms
- id: my_script
  value:
    type: script
    path: f/my-script
    input_transforms:
      param1:
        type: javascript
        expr: flow_input.param1
      param2:
        type: javascript
        expr: results.previous_step.data
```

### ❌ No Manejar Errores en Branch All

```yaml
# MAL: Una rama falla, todo el flow falla
- id: parallel_notifications
  value:
    type: branchall
    # skip_failures: false (default)

# BIEN: Continuar si una rama falla
- id: parallel_notifications
  value:
    type: branchall
    skip_failures: true  # Ignorar fallos individuales
```

### ❌ Suspend sin Timeout

```yaml
# MAL: Puede quedar suspendido indefinidamente
- id: approval
  suspend:
    required_events: 1
    # timeout: ??? (sin timeout!)

# BIEN: Con timeout
- id: approval
  suspend:
    required_events: 1
    timeout: 3600  # 1 hora máximo
```

## Métricas a Monitorear

| Métrica | Alerta Si | Acción |
|---------|-----------|--------|
| Flow execution time p95 | > 30s | Optimizar pasos lentos |
| Failure rate | > 5% | Revisar error handler |
| Retry rate | > 10% | Ajustar retry config |
| Suspend timeout rate | > 2% | Reducir timeout o mejorar notificaciones |
| Branch skip rate | > 50% | Revisar lógica de branching |

## Checklist Producción

- [ ] Module IDs únicos y descriptivos
- [ ] input_transforms para todos los scripts
- [ ] Retry config para operaciones externas
- [ ] Failure handler con rollback
- [ ] skip_if para manejo de errores condicionales
- [ ] Suspend con timeout configurado
- [ ] Idempotency key para operaciones críticas
- [ ] Logging estructurado en rawscripts
- [ ] Schema de input validado
- [ ] Testing con flow preview
