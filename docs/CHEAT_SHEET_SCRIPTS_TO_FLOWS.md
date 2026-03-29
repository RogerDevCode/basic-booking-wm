# 📝 Cheat Sheet: Scripts → Flows

## Quick Reference

### Estructura Básica de Flow

```yaml
summary: Descripción corta
description: Descripción detallada

value:
  modules:
    - id: paso_1
      value:
        type: script
        path: f/nombre-script
        input_transforms:
          param:
            type: javascript
            expr: flow_input.param

schema:
  type: object
  properties:
    param:
      type: string
```

---

## Tipos de Módulos

| Tipo | Cuándo Usar | Ejemplo |
|------|-------------|---------|
| `script` | Llamar script existente | `type: script, path: f/booking-create` |
| `rawscript` | Código inline en flow | `type: rawscript, language: bun, content: \|` |
| `flow` | Sub-flow (flow anidado) | `type: flow, path: f/sub-flow__flow` |
| `forloopflow` | Iterar sobre array | `type: forloopflow, iterator: {...}` |
| `branchone` | Switch/Case (un camino) | `type: branchone, cases: [...]` |
| `branchall` | Ejecutar todos los branches | `type: branchall, branches: [...]` |

---

## Input Transforms

### De Flow Input

```yaml
input_transforms:
  provider_id:
    type: javascript
    expr: flow_input.provider_id
```

### De Paso Anterior

```yaml
input_transforms:
  event_id:
    type: javascript
    expr: results.gcal_create_event.data.event_id
```

### Valor Estático

```yaml
input_transforms:
  service_id:
    type: static
    value: "gcal"
```

### Referencia a Recurso

```yaml
input_transforms:
  database:
    type: static
    value: "$res:f/resources/my-database"
```

---

## Condiciones

### Skip (Omitir paso)

```yaml
skip_if:
  expr: results.paso_anterior.data?.state === 'error'
```

### Retry (Reintentar)

```yaml
retry:
  constant:
    attempts: 3
    seconds: 2
```

### Sleep (Esperar)

```yaml
sleep:
  type: static
  value: 5  # segundos
```

### Stop After (Detener flow)

```yaml
stop_after_if:
  expr: results.paso_actual.data?.should_stop === true
```

---

## Failure Handler

```yaml
- id: failure
  summary: Rollback on error
  value:
    type: rawscript
    language: bun
    content: |
      export async function main(error: any, results: any) {
        // Rollback logic
        if (results.lock?.data?.token) {
          await releaseLock(results.lock.data.token);
        }
        return { error: error.message };
      }
```

---

## Patrones Comunes

### 1. Secuencia Simple

```yaml
modules:
  - id: paso1
    value:
      type: script
      path: f/script1
  
  - id: paso2
    value:
      type: script
      path: f/script2
      input_transforms:
        data:
          type: javascript
          expr: results.paso1.data
```

---

### 2. Condición (If/Else)

```yaml
modules:
  - id: check_condition
    value:
      type: script
      path: f/check
  
  - id: paso_if_true
    skip_if:
      expr: !results.check_condition.data.ok
    value:
      type: script
      path: f/do-something
  
  - id: paso_if_false
    skip_if:
      expr: results.check_condition.data.ok
    value:
      type: script
      path: f/do-other-thing
```

---

### 3. Paralelismo

```yaml
modules:
  - id: send_email
    value:
      type: script
      path: f/gmail-send
  
  - id: send_telegram
    value:
      type: script
      path: f/telegram-send
  
  # Ambos se ejecutan en paralelo
```

---

### 4. Loop (For Each)

```yaml
modules:
  - id: get_items
    value:
      type: script
      path: f/get-all
  
  - id: process_loop
    value:
      type: forloopflow
      iterator:
        type: javascript
        expr: results.get_items.data.items
      modules:
        - id: process_item
          value:
            type: script
            path: f/process-one
            input_transforms:
              item:
                type: javascript
                expr: flow_input.iter.value
```

---

### 5. Branch (Switch/Case)

```yaml
modules:
  - id: detect_type
    value:
      type: script
      path: f/detect
  
  - id: branch_type
    value:
      type: branchone
      cases:
        - condition:
            type: javascript
            expr: results.detect_type.data.type === 'A'
          modules:
            - id: process_a
              value:
                type: script
                path: f/process-a
        
        - condition:
            type: javascript
            expr: results.detect_type.data.type === 'B'
          modules:
            - id: process_b
              value:
                type: script
                path: f/process-b
```

---

### 6. Circuit Breaker Pattern

```yaml
modules:
  - id: check_cb
    value:
      type: script
      path: f/circuit-breaker-check
      input_transforms:
        service_id:
          type: static
          value: "external-api"
  
  - id: proceed_if_ok
    skip_if:
      expr: results.check_cb.data?.state === 'open'
    value:
      type: script
      path: f/call-external-api
  
  - id: record_result
    value:
      type: script
      path: f/circuit-breaker-record
      input_transforms:
        service_id:
          type: static
          value: "external-api"
        success:
          type: javascript
          expr: results.proceed_if_ok.success
```

---

### 7. Distributed Lock Pattern

```yaml
modules:
  - id: acquire_lock
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
  
  - id: do_work
    value:
      type: script
      path: f/do-work
  
  - id: release_lock
    value:
      type: script
      path: f/distributed-lock-release
      input_transforms:
        owner_token:
          type: javascript
          expr: results.acquire_lock.data.owner_token
  
  - id: failure
    value:
      type: rawscript
      language: bun
      content: |
        export async function main(error: any, results: any) {
          if (results.acquire_lock?.data?.owner_token) {
            await releaseLock(results.acquire_lock.data.owner_token);
          }
          return { error: error.message };
        }
```

---

### 8. Rollback Pattern

```yaml
modules:
  - id: step1_create_gcal
    value:
      type: script
      path: f/gcal-create-event
  
  - id: step2_create_db
    value:
      type: script
      path: f/db-create
  
  - id: failure
    value:
      type: rawscript
      language: bun
      content: |
        export async function main(error: any, results: any) {
          const rollbacks = [];
          
          // Rollback step2
          if (results.step2_create_db?.data?.id) {
            rollbacks.push(
              deleteFromDB(results.step2_create_db.data.id)
            );
          }
          
          // Rollback step1
          if (results.step1_create_gcal?.data?.event_id) {
            rollbacks.push(
              deleteGCalEvent(results.step1_create_gcal.data.event_id)
            );
          }
          
          await Promise.all(rollbacks);
          return { error: error.message, rollback: 'completed' };
        }
```

---

## Comandos Útiles

```bash
# Crear flow
mkdir f/my-flow__flow
cat > f/my-flow__flow/flow.yaml << 'EOF'
# flow definition
EOF

# Generar locks
wmill flow generate-locks f/my-flow__flow --yes

# Push a Windmill
wmill sync push

# Ver flow
wmill flow get f/my-flow__flow

# Listar flows
wmill flow list

# Ejecutar flow
wmill flow run f/my-flow__flow --arg key=value
```

---

## Variables Disponibles

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `flow_input` | Input del flow | `flow_input.provider_id` |
| `results.step_id` | Output de paso anterior | `results.paso1.data` |
| `flow_input.iter.value` | Item actual (en loop) | `flow_input.iter.value.id` |
| `flow_input.iter.index` | Índice actual (en loop) | `flow_input.iter.index` |
| `error` | Error object (en failure handler) | `error.message` |
| `results` | Todos los resultados (en failure handler) | `results.paso1.data` |

---

## Errores Comunes

### ❌ Missing input_transforms

```yaml
# Mal - Sin input_transforms
- id: paso
  value:
    type: script
    path: f/myscript

# Bien - Con input_transforms
- id: paso
  value:
    type: script
    path: f/myscript
    input_transforms:
      param:
        type: javascript
        expr: flow_input.param
```

---

### ❌ Referenciar paso futuro

```yaml
# Mal - paso2 aún no existe
- id: paso1
  value:
    type: javascript
    expr: results.paso2.data  # ERROR!

# Bien - Referenciar paso anterior
- id: paso2
  value:
    type: script
    path: f/script2

- id: paso1
  value:
    type: javascript
    expr: results.paso2.data  # OK
```

---

### ❌ IDs duplicados

```yaml
# Mal - IDs duplicados
- id: paso
  value: ...
- id: paso  # ERROR! Duplicado
  value: ...

# Bien - IDs únicos
- id: paso1
  value: ...
- id: paso2
  value: ...
```

---

## Checklist Before Push

- [ ] Cada módulo tiene `id` único
- [ ] Cada script tiene `input_transforms`
- [ ] `schema` define inputs correctamente
- [ ] `failure_handler` si necesita rollback
- [ ] `skip_if` para manejo de errores
- [ ] `retry` para operaciones idempotentes
- [ ] Generar locks: `wmill flow generate-locks`
- [ ] Testear localmente si es posible

---

## Recursos

- **Ejemplos Reales:** `f/telegram-webhook__flow/flow.yaml`
- **Ejemplos Reales:** `f/booking-orchestrator-flow__flow/flow.yaml`
- **Docs:** https://docs.windmill.dev/core-concepts/flows
- **Skill:** `.claude/skills/write-flow/SKILL.md`

---

**Versión:** 1.0.0
**Última actualización:** 2026-03-26
