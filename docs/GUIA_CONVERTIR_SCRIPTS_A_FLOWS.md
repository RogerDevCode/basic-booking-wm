# 🔄 Guía: Convertir Scripts a Flows en Windmill

**Objetivo:** Aprender a convertir scripts existentes en Flows visuales para mejor orquestación y debugging.

---

## 📋 Índice

1. [Cuándo Convertir](#cuándo-convertir)
2. [Tipos de Conversión](#tipos-de-conversión)
3. [Ejemplo Práctico](#ejemplo-práctico)
4. [Paso a Paso](#paso-a-paso)
5. [Mejores Prácticas](#mejores-prácticas)
6. [Ejemplos de Código](#ejemplos-de-código)

---

## Cuándo Convertir

### ✅ Convierte a Flow cuando:

- **Orquestación:** Necesitas llamar múltiples scripts en secuencia
- **Visibilidad:** Quieres ver el flujo completo gráficamente
- **Error Handling:** Necesitas manejo de errores visual con rollback
- **Paralelismo:** Quieres ejecutar pasos en paralelo
- **Condicionales:** Necesitas branches basados en resultados
- **Business Process:** Es un proceso de negocio completo (ej: booking)

### ❌ No conviertas cuando:

- **Operación Atómica:** El script hace una sola cosa (ej: INSERT en DB)
- **Performance Crítico:** Cada milisegundo cuenta
- **Lógica Reutilizable:** Es una función utilitaria que se usa en muchos lados
- **Ya está bien como Script:** Si funciona y no necesita orquestación, déjalo como script

---

## Tipos de Conversión

### Tipo 1: Flow Orquestador (Recomendado)

El flow llama scripts existentes:

```yaml
value:
  modules:
    - id: step1
      value:
        type: script
        path: f/existing-script
        input_transforms:
          param1:
            type: javascript
            expr: flow_input.value
```

**Ventajas:**
- ✅ Reutiliza código existente
- ✅ Cada script es testeable individualmente
- ✅ Flow visual para debugging
- ✅ Fácil mantenimiento

---

### Tipo 2: Flow con RawScript (Todo en uno)

El código va inline en el flow:

```yaml
value:
  modules:
    - id: process_all
      value:
        type: rawscript
        language: bun
        content: |
          export async function main(input: any) {
            // Todo el código aquí
          }
```

**Ventajas:**
- ✅ Todo en un lugar
- ✅ Menos overhead de llamadas

**Desventajas:**
- ❌ No reutiliza scripts
- ❌ Difícil de testear
- ❌ Código duplicado

---

### Tipo 3: Flow Híbrido (Mejor de ambos)

Combina scripts + rawscripts:

```yaml
value:
  modules:
    # Script existente para lógica de negocio
    - id: create_booking
      value:
        type: script
        path: f/booking-create
    
    # RawScript para transformación de datos
    - id: format_message
      value:
        type: rawscript
        language: bun
        content: |
          export async function main(booking: any) {
            return `Booking ${booking.id} created!`;
          }
        input_transforms:
          booking:
            type: javascript
            expr: results.create_booking.data
    
    # Script existente para notificación
    - id: send_notification
      value:
        type: script
        path: f/telegram-send
```

---

## Ejemplo Práctico

### Script Original (Go)

```go
// f/booking-orchestrator/main.go
func main(provider_id, service_id, start_time string) {
    // 1. Check circuit breaker
    cb := checkCircuitBreaker("gcal")
    if cb.State == "open" {
        return Error("Service unavailable")
    }
    
    // 2. Acquire lock
    lock := acquireLock(provider_id, start_time)
    
    // 3. Check availability
    avail := checkAvailability(provider_id, service_id, start_time)
    if !avail.Available {
        releaseLock(lock)
        return Error("Not available")
    }
    
    // 4. Create GCal event
    event := createGCalEvent(provider_id, start_time)
    
    // 5. Create booking in DB
    booking := createBooking(provider_id, service_id, start_time, event.ID)
    
    // 6. Release lock
    releaseLock(lock)
    
    return Success(booking)
}
```

### Flow Equivalente

```yaml
# f/booking-orchestrator-flow__flow/flow.yaml
summary: Booking Orchestrator Flow
value:
  modules:
    - id: circuit_breaker_check
      value:
        type: script
        path: f/circuit-breaker-check
        input_transforms:
          service_id:
            type: static
            value: "gcal"
    
    - id: distributed_lock_acquire
      value:
        type: script
        path: f/distributed-lock-acquire
      skip_if:
        expr: results.circuit_breaker_check.data?.state === 'open'
    
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
    
    - id: gcal_create_event
      value:
        type: script
        path: f/gcal-create-event
        input_transforms:
          provider_id:
            type: javascript
            expr: flow_input.provider_id
    
    - id: booking_create
      value:
        type: script
        path: f/booking-create
        input_transforms:
          provider_id:
            type: javascript
            expr: flow_input.provider_id
          gcal_event_id:
            type: javascript
            expr: results.gcal_create_event.data.event_id
    
    - id: distributed_lock_release
      value:
        type: script
        path: f/distributed-lock-release
        input_transforms:
          owner_token:
            type: javascript
            expr: results.distributed_lock_acquire.data.owner_token
    
    # Failure handler con rollback
    - id: failure
      value:
        type: rawscript
        language: bun
        content: |
          export async function main(error: any, results: any) {
            // Rollback logic
            if (results.gcal_create_event?.data?.event_id) {
              await deleteGCalEvent(results.gcal_create_event.data.event_id);
            }
            if (results.distributed_lock_acquire?.data?.owner_token) {
              await releaseLock(results.distributed_lock_acquire.data.owner_token);
            }
            return { error: error.message, rollback: 'completed' };
          }
```

---

## Paso a Paso

### Paso 1: Identificar Scripts a Orquestar

```bash
# Lista tus scripts actuales
ls f/

# Ejemplo:
# - circuit-breaker-check
# - distributed-lock-acquire
# - availability-check
# - gcal-create-event
# - booking-create
# - telegram-send
```

### Paso 2: Crear Carpeta del Flow

```bash
# Los flows terminan con __flow
mkdir -p f/booking-orchestrator-flow__flow
```

### Paso 3: Crear flow.yaml

```bash
cat > f/booking-orchestrator-flow__flow/flow.yaml << 'EOF'
summary: Descripción corta del flow
description: |
  Descripción detallada del flow.
  Explica qué hace, cuándo usarlo, etc.

value:
  modules:
    # Agrega módulos aquí
```

### Paso 4: Agregar Módulos

Para cada script que quieras llamar:

```yaml
- id: nombre_paso
  summary: Descripción corta
  value:
    type: script
    path: f/nombre-del-script
    input_transforms:
      param1:
        type: javascript
        expr: flow_input.param1
      param2:
        type: javascript
        expr: results.paso_anterior.data.valor
```

### Paso 5: Definir Schema de Input

```yaml
schema:
  type: object
  properties:
    provider_id:
      type: number
      description: ID del proveedor
    service_id:
      type: number
      description: ID del servicio
    start_time:
      type: string
      format: date-time
```

### Paso 6: Agregar Failure Handler (Opcional pero recomendado)

```yaml
- id: failure
  summary: Manejador de errores con rollback
  value:
    type: rawscript
    language: bun
    content: |
      export async function main(error: any, results: any) {
        // Lógica de rollback
        return { error: error.message };
      }
```

### Paso 7: Generar Locks y Deploy

```bash
# Generar locks para el flow
wmill flow generate-locks f/booking-orchestrator-flow__flow --yes

# Push a Windmill
wmill sync push
```

### Paso 8: Verificar en UI

```
1. Ve a https://windmill.stax.ink
2. Navega a: f/booking-orchestrator-flow__flow
3. Click en "Flow" tab
4. Deberías ver el diagrama visual
```

---

## Mejores Prácticas

### 1. Nombres Descriptivos

```yaml
# ✅ Bien
- id: circuit_breaker_check
  summary: Verificar estado del Circuit Breaker

# ❌ Mal
- id: step1
  summary: Check CB
```

---

### 2. Input Transforms Claros

```yaml
# ✅ Bien - Explícito
input_transforms:
  provider_id:
    type: javascript
    expr: flow_input.provider_id

# ❌ Mal - Implícito
input_transforms:
  provider_id: flow_input.provider_id
```

---

### 3. Skip Conditions para Manejo de Errores

```yaml
# ✅ Bien - Skip si CB está open
- id: proceed_if_cb_ok
  skip_if:
    expr: results.circuit_breaker_check.data?.state === 'open'
```

---

### 4. Failure Handler con Rollback

```yaml
# ✅ Bien - Rollback completo
- id: failure
  value:
    type: rawscript
    content: |
      export async function main(error: any, results: any) {
        const rollback = [];
        
        if (results.gcal_event?.data?.id) {
          rollback.push(deleteGCal(results.gcal_event.data.id));
        }
        
        if (results.lock?.data?.token) {
          rollback.push(releaseLock(results.lock.data.token));
        }
        
        await Promise.all(rollback);
        return { error: error.message, rollback: 'completed' };
      }
```

---

### 5. Retry para Operaciones Idempotentes

```yaml
# ✅ Bien - Reintentar 2 veces
- id: gcal_create_event
  retry:
    constant:
      attempts: 2
      seconds: 1
```

---

### 6. Sleep para Rate Limiting

```yaml
# ✅ Bien - Esperar entre llamadas
- id: send_telegram
  sleep:
    type: static
    value: 2  # 2 segundos
```

---

### 7. Paralelismo cuando sea posible

```yaml
# ✅ Bien - Ejecutar en paralelo
- id: send_telegram
  value:
    type: script
    path: f/telegram-send

- id: send_gmail
  value:
    type: script
    path: f/gmail-send
  # Se ejecuta en paralelo con telegram-send
```

---

## Ejemplos de Código

### Ejemplo 1: Flow con Condicionales

```yaml
value:
  modules:
    - id: detect_intent
      value:
        type: script
        path: f/ai_agent
    
    # Solo ejecuta si es create_appointment
    - id: create_booking
      skip_if:
        expr: results.detect_intent.data?.intent !== 'create_appointment'
      value:
        type: script
        path: f/booking-create
    
    # Solo ejecuta si es cancel_appointment
    - id: cancel_booking
      skip_if:
        expr: results.detect_intent.data?.intent !== 'cancel_appointment'
      value:
        type: script
        path: f/booking-cancel
```

---

### Ejemplo 2: Flow con Paralelismo

```yaml
value:
  modules:
    - id: create_booking
      value:
        type: script
        path: f/booking-create
    
    # Se ejecuta en paralelo
    - id: send_telegram
      value:
        type: script
        path: f/telegram-send
        input_transforms:
          chat_id:
            type: javascript
            expr: flow_input.chat_id
    
    # Se ejecuta en paralelo
    - id: send_gmail
      value:
        type: script
        path: f/gmail-send
        input_transforms:
          email:
            type: javascript
            expr: flow_input.user_email
```

---

### Ejemplo 3: Flow con Loop

```yaml
value:
  modules:
    - id: get_all_bookings
      value:
        type: script
        path: f/get-all-bookings
    
    - id: send_reminder_loop
      value:
        type: forloopflow
        iterator:
          type: javascript
          expr: results.get_all_bookings.data.bookings
        modules:
          - id: send_reminder
            value:
              type: script
              path: f/telegram-send
              input_transforms:
                chat_id:
                  type: javascript
                  expr: flow_input.iter.value.chat_id
                text:
                  type: javascript
                  expr: `Recordatorio: ${flow_input.iter.value.service}`
```

---

### Ejemplo 4: Flow con Branch (Switch)

```yaml
value:
  modules:
    - id: detect_intent
      value:
        type: script
        path: f/ai_agent
    
    # Branch basado en intent
    - id: branch_by_intent
      value:
        type: branchone
        cases:
          - condition:
              type: javascript
              expr: results.detect_intent.data?.intent === 'create_appointment'
            modules:
              - id: create_booking
                value:
                  type: script
                  path: f/booking-create
          
          - condition:
              type: javascript
              expr: results.detect_intent.data?.intent === 'cancel_appointment'
            modules:
              - id: cancel_booking
                value:
                  type: script
                  path: f/booking-cancel
          
          - condition:
              type: javascript
              expr: results.detect_intent.data?.intent === 'check_availability'
            modules:
              - id: check_availability
                value:
                  type: script
                  path: f/availability-check
```

---

## 📊 Comparación Final

### Antes (Script Monolítico)

```
booking-orchestrator.go (300 líneas)
├── Circuit breaker logic
├── Lock logic
├── Availability logic
├── GCal logic
├── DB logic
└── Rollback logic

❌ Difícil de debuggear
❌ No ves el flujo
❌ Todo o nada
```

### Después (Flow Orquestador)

```
booking-orchestrator-flow__flow/flow.yaml
├── circuit_breaker_check → f/circuit-breaker-check
├── distributed_lock_acquire → f/distributed-lock-acquire
├── availability_check → f/availability-check
├── gcal_create_event → f/gcal-create-event
├── booking_create → f/booking-create
├── distributed_lock_release → f/distributed-lock-release
└── failure_handler → rollback

✅ Visual en Windmill UI
✅ Cada paso es testeable
✅ Rollback automático
✅ Fácil de debuggear
```

---

## 🎯 Checklist de Conversión

- [ ] Identificar scripts a orquestar
- [ ] Crear carpeta `__flow`
- [ ] Crear `flow.yaml` con summary y description
- [ ] Agregar módulos con `type: script`
- [ ] Definir `input_transforms` para cada módulo
- [ ] Agregar `schema` de input
- [ ] Agregar `failure_handler` si necesita rollback
- [ ] Agregar `skip_if` para manejo de errores
- [ ] Agregar `retry` si es necesario
- [ ] Generar locks: `wmill flow generate-locks`
- [ ] Push: `wmill sync push`
- [ ] Verificar en UI
- [ ] Testear con datos reales

---

## 🔗 Recursos

- **Ejemplo Real:** `f/booking-orchestrator-flow__flow/flow.yaml`
- **Ejemplo Real:** `f/telegram-webhook__flow/flow.yaml`
- **Docs Oficiales:** https://docs.windmill.dev/core-concepts/flows
- **OpenFlow Schema:** Ver `.claude/skills/write-flow/SKILL.md`

---

**Última actualización:** 2026-03-26
**Autor:** Booking Titanium Team
