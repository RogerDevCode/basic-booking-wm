# Windmill Flows - Deployment Guide

## Errores Comunes y Soluciones

### Error 1: `proper_id` Constraint Violation

**Síntoma:**
```
Error: Failed to create flow f/booking_orchestrator: 
SqlErr: violates check constraint "proper_id"
```

**Causa:**
- Flow en `f/nombre__flow/` = 2 segmentos
- Windmill requiere **mínimo 3 segmentos**: `f/<carpeta>/<nombre>`

**Solución:**
```bash
# ❌ MAL (2 segmentos)
f/booking_orchestrator__flow/flow.yaml

# ✅ BIEN (3 segmentos)
f/flows/booking_orchestrator__flow/flow.yaml
```

---

### Error 2: `type: path` Inválido

**Síntoma:**
```yaml
- id: parse_message
  value:
    type: path  # ❌ ERROR
    path: f/internal/message_parser
```

**Causa:**
- `type: path` NO existe en OpenFlow schema

**Solución:**
```yaml
# ✅ BIEN
- id: parse_message
  value:
    type: script  # ✅ VÁLIDO
    path: f/internal/message_parser
    input_transforms:
      chat_id:
        type: javascript
        expr: flow_input.chat_id
```

---

## Tipos de Módulos Válidos

| Tipo | Uso | Ejemplo |
|------|-----|---------|
| `script` | Script existente | `type: script, path: f/my_script` |
| `flow` | Sub-flow anidado | `type: flow, path: f/sub_flow__flow` |
| `rawscript` | Código inline | `type: rawscript, language: bun, content: \|` |
| `forloopflow` | Iterar array | `type: forloopflow, iterator: {...}` |
| `branchone` | Switch/Case | `type: branchone, branches: [...]` |
| `branchall` | Paralelo | `type: branchall, branches: [...]` |

**Nunca usar:** `type: path` (no existe)

---

## Estructura de Directorios

```bash
# ✅ CORRECTO
f/
├── flows/                    # Flows (3 segmentos)
│   ├── booking_orchestrator__flow/
│   │   ├── flow.yaml
│   │   └── folder.meta.yaml
│   └── telegram_webhook__flow/
├── scripts/                  # Scripts compartidos
│   └── utils.ts
└── internal/                 # Scripts internos
    ├── message_parser/
    └── ai_agent/

# ❌ INCORRECTO
f/
└── booking_orchestrator__flow/  # ¡Solo 2 segmentos!
```

---

## Convenciones de Nombres

| Entidad | Convención | Ejemplo |
|---------|------------|---------|
| Scripts Go | snake_case | `booking_create` |
| Scripts TS/Bun | snake_case | `message_parser` |
| Flows (path) | snake_case + `__flow` | `booking_orchestrator__flow` |
| Folder (path) | snake_case | `booking_orchestrator__flow` |
| display_name | Title Case | `Booking Orchestrator Flow` |

---

## folder.meta.yaml

```yaml
# ✅ CORRECTO
summary: "Descripción breve"
display_name: Booking Orchestrator Flow  # Title Case
owners: []
extra_perms: {}

# ❌ INCORRECTO
display_name: booking_orchestrator_flow  # No snake_case
```

---

## flow.yaml - Estructura Mínima

```yaml
summary: Descripción breve
description: |
  Descripción detallada del flow.

value:
  modules:
    - id: step_1  # snake_case, único
      summary: Descripción del paso
      value:
        type: script
        path: f/existing_script
        input_transforms:
          param:
            type: javascript
            expr: flow_input.param

schema:
  type: object
  properties:
    input_param:
      type: string
```

---

## Checklist Creación de Flows

- [ ] Directorio en `f/flows/<nombre>__flow/` (3 segmentos)
- [ ] folder.meta.yaml con display_name en Title Case
- [ ] flow.yaml con summary y description
- [ ] Módulos usan `type: script` (no `type: path`)
- [ ] Module IDs únicos en snake_case
- [ ] input_transforms definidos para cada módulo
- [ ] schema de input definido
- [ ] `wmill flow generate-locks <path> --yes`
- [ ] `wmill sync push --yes`

---

## Template para Nuevos Flows

```bash
# 1. Crear directorio
mkdir -p f/flows/nuevo_flow__flow

# 2. Crear folder.meta.yaml
cat > f/flows/nuevo_flow__flow/folder.meta.yaml << 'EOF'
summary: "Descripción breve"
display_name: Nuevo Flow
owners: []
extra_perms: {}
EOF

# 3. Crear flow.yaml
cat > f/flows/nuevo_flow__flow/flow.yaml << 'EOF'
summary: Descripción del flow
description: |
  Descripción detallada.

value:
  modules:
    - id: step_1
      summary: Primer paso
      value:
        type: script
        path: f/existing_script
        input_transforms:
          param:
            type: javascript
            expr: flow_input.param

schema:
  type: object
  properties:
    param:
      type: string
EOF

# 4. Generar locks y push
wmill flow generate-locks f/flows/nuevo_flow__flow --yes
wmill sync push --yes
```

---

## Comandos Debugging

```bash
# Verificar estructura de flows
find f/ -name "*__flow" -type d

# Ver folder.meta.yaml
cat f/flows/my_flow__flow/folder.meta.yaml

# Validar YAML
yamllint f/flows/my_flow__flow/flow.yaml

# Ver flows remotos
wmill flow list

# Ver detalle de flow
wmill flow get f/flows/my_flow__flow

# Preview flow sin deploy
wmill flow preview f/flows/my_flow__flow
```

---

## Referencias Rápidas

| Problema | Solución |
|----------|----------|
| `proper_id` error | Mover a `f/flows/` (3 segmentos) |
| `type: path` error | Cambiar a `type: script` |
| Module ID duplicado | Usar IDs únicos en snake_case |
| Sin parámetros en script | Agregar `input_transforms` |
| Flow no aparece | Verificar `__flow` en nombre de carpeta |

---

## Verificación Pre-Push

```bash
# 1. Verificar estructura
tree f/flows/

# 2. Validar YAML
for f in f/flows/*__flow/*.yaml; do
  echo "Validating $f"
  yamllint "$f"
done

# 3. Generar locks
wmill flow generate-locks f/flows/<nombre_flow> --yes

# 4. Preview
wmill flow preview f/flows/<nombre_flow>

# 5. Push
wmill sync push --yes
```

---

**Documentación relacionada:**
- `@docs/best-practices/flows-windmill.md` - Guía completa de flows
- `@docs/best-practices/scripts-go-windmill.md` - Scripts en Go
- `@docs/best-practices/typescript-bun-windmill.md` - Scripts en TypeScript/Bun
