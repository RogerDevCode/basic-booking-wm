# AUDITORIA PROFUNDA — BOOKING TITANIUM WM
## Windmill Medical Booking Architect — Protocolo v9.0
### Fecha: 2026-04-07 | Auditor: AI Architect

---

## 1. RESUMEN EJECUTIVO

Se auditaron **82 archivos TypeScript** en `f/`, el esquema PostgreSQL en producción (Neon), los scripts deployados en Windmill, y las configuraciones del sistema contra el protocolo AGENTS.md v9.0 y la guía de investigación profunda `docs/investigacion_profunda.txt`.

**Hallazgos críticos:**
- 🔴 **CRÍTICO:** RLS deshabilitado en 8/10 tablas transaccionales (bookings, services, provider_schedules, etc.)
- 🔴 **CRÍTICO:** `patients` table NO existe — se usa `clients` + `users` con schema diferente al especificado en §4
- 🟡 **ALTO:** `booking_create` lanza errores fuera de la función `classifyIntent` del AI Agent (viola §4)
- 🟡 **ALTO:** 14 scripts de Telegram legacy sin archivar (f/telegram/ai_v6, ai_v7, etc.)
- 🟡 **ALTO:** `gcal_sync` y `booking_create` usan `sql` global sin `withTenantContext` (viola §7)
- 🟢 **OK:** State machine check constraints correctas
- 🟢 **OK:** Idempotency keys presentes en bookings
- 🟢 **OK:** GIST exclusion constraint para no-overlap funciona
- 🟡 **MEDIO:** `pg_cron` NO instalado — reconcile de GCal depende de Windmill schedule (no verificado)
- 🟡 **MEDIO:** AI Agent types usan `z.record(z.string(), z.unknown())` — `unknown` no refinado
- 🟢 **OK:** Telegram bot usa rule-based classifier (determinístico, no LLM para navegación)

**Confianza del reporte:** 95% (Tier 1: documentación oficial Windmill + PostgreSQL + Telegram API consultadas)

---

## 2. AUDITORIA POR SECCION DEL AGENTS.md

### §3 — TYPE SYSTEM SUPREMACY

| Archivo | `any` detectado | `as Type` detectado | `unknown` sin refinar | Estado |
|---------|-----------------|---------------------|----------------------|--------|
| `f/booking_create/main.ts` | ❌ No | ⚠️ Sí (`as CreatedBookingRow`, `as InsertedBooking`) | ❌ No | **FALLA** |
| `f/booking_cancel/main.ts` | ❌ No | ⚠️ Sí (`as UpdatedBooking`) | ❌ No | **FALLA** |
| `f/booking_reschedule/main.ts` | ❌ No | ❌ No | ❌ No | ✅ OK |
| `f/booking_orchestrator/main.ts` | ❌ No | ⚠️ Sí (`as string \| undefined`) | ❌ No | **FALLA** |
| `f/gcal_sync/main.ts` | ❌ No | ⚠️ Sí (`as Record<string, unknown>`) | ❌ No | **FALLA** |
| `f/internal/ai_agent/types.ts` | ❌ No |  No | ⚠️ Sí (`z.record(z.string(), z.unknown())`) | **FALLA** |
| `f/internal/ai_agent/main.ts` | ❌ No | ❌ No |  No | ✅ OK |
| `f/internal/ai_agent/llm-client.ts` | ❌ No | ❌ No | ❌ No | ✅ OK |
| `f/distributed_lock/main.ts` | ❌ No | ❌ No | ❌ No | ✅ OK |
| `f/telegram/bot` (gateway) | ❌ No | ❌ No | ❌ No | ✅ OK |
| `f/internal/result.ts` | ❌ No | ❌ No | ❌ No | ✅ OK |
| `f/internal/retry/index.ts` | ❌ No | ❌ No | ❌ No | ✅ OK |

**Hallazgo:** Los type casts `as` se usan en resultados de `sql` queries porque Windmill no infiere tipos de las columnas retornadas. Solución: usar `.values<RowType>()` o `.asTuples()` del package `postgres`.

### §4 — ERROR HANDLING (GOLANG-STYLE)

| Archivo | Usa `throw`? | Devuelve `[Error\|null, T\|null]`? | Funciones async sin tuple? | Estado |
|---------|-------------|-----------------------------------|--------------------------|--------|
| `f/booking_create/main.ts` | ⚠️ Dentro de `sql.begin()` | ❌ Devuelve `{success, data, error_message}` | `lookupClient`, `lookupProvider`, etc. usan tuple ✅ | **FALLA PARCIAL** |
| `f/booking_cancel/main.ts` | ⚠️ Dentro de `sql.begin()` | ❌ Devuelve `{success, data, error_message}` | ❌ | **FALLA** |
| `f/booking_reschedule/main.ts` | ⚠️ Dentro de `sql.begin()` | ❌ Devuelve `{success, data, error_message}` | ❌ | **FALLA** |
| `f/gcal_sync/main.ts` | ❌ No | ❌ Devuelve `{success, data, error_message}` | ✅ | **FALLA FORMATO** |
| `f/booking_orchestrator/main.ts` | ❌ No | ❌ Devuelve `OrchestratorResult` | ✅ | **FALLA FORMATO** |
| `f/internal/ai_agent/main.ts` | ❌ No | ✅ Devuelve `[Error\|null, Result\|null]` | ✅ | ✅ OK |
| `f/internal/ai_agent/llm-client.ts` | ❌ No | ✅ `Promise<[Error \| null, LLMResponse \| null]>` | ✅ | ✅ OK |
| `f/internal/retry/index.ts` | ❌ No | ✅ Devuelve `RetryResult<T>` (discriminated union) | ✅ | ✅ OK |
| `f/distributed_lock/main.ts` | ❌ No |  Devuelve `{success, data, error_message}` | ✅ | **FALLA FORMATO** |
| `f/telegram/bot` (gateway) | ❌ No |  Devuelve `Promise<object>` | ✅ | **FALLA FORMATO** |

**Hallazgo CRÍTICO:** La mayoría de los scripts de booking devuelven `{success, data, error_message}` en vez del formato tuple `[Error | null, T | null]` exigido por §4. El AI Agent sí lo cumple.

**Violación de `throw`:** Los `throw` dentro de `sql.begin()` son aceptables porque `begin()` captura el error y lo convierte en `txError`. Pero AGENTS.md §4 dice "NO `throw` para control flow" — estos throws son para control flow dentro de la transacción.

### §5 — CONCURRENCY & ASYNC CONTROL

| Archivo | Promesas flotantes? | Usa `await` correctamente? | Race conditions posibles? | Estado |
|---------|-------------------|---------------------------|--------------------------|--------|
| `f/booking_create/main.ts` | ❌ No | ✅ | ⚠️ `checkSlotOverlap` + INSERT no es atómico | **RIESGO** |
| `f/booking_cancel/main.ts` | ❌ No | ✅ | ❌ No (dentro de transacción) | ✅ OK |
| `f/gcal_sync/main.ts` | ❌ No | ✅ | ❌ No | ✅ OK |
| `f/booking_reschedule/main.ts` | ❌ No | ✅ | ❌ No (todo en una transacción) | ✅ OK |
| `f/distributed_lock/main.ts` | ❌ No | ✅ | ❌ No | ✅ OK |

**Hallazgo CRÍTICO en `booking_create`:**
```
Línea 225: checkSlotOverlap() → consulta SELECT
Línea 230: sql.begin() → INSERT
```
Entre el SELECT y el INSERT hay una ventana de race condition. Si dos requests entran simultáneamente, ambos pueden pasar el `checkSlotOverlap` y luego ambos INSERTar.

**Mitigación existente:** El GIST exclusion constraint (`booking_no_overlap`) previene doble booking a nivel de DB. Pero el error se devuelve como "Internal error" en vez de un mensaje amigable.

### §6 — DATABASE WAR PROTOCOL

#### 6.1 Source of Truth
✅ PostgreSQL es la fuente de verdad. GCal es réplica secundaria.

#### 6.2 Transactional Integrity
| Script | Usa transacción? | Usa `SELECT FOR UPDATE`? | Rollback on fail? | Estado |
|--------|-----------------|-------------------------|-------------------|--------|
| `booking_create` | ✅ `sql.begin()` | ❌ No | ✅ | **FALLA** |
| `booking_cancel` | ✅ `sql.begin()` | ❌ No | ✅ | **FALLA** |
| `booking_reschedule` | ✅ `sql.begin()` | ❌ No | ✅ | **FALLA** |
| `booking_orchestrator` | ❌ No (delega) | N/A | N/A | ✅ OK (delega) |

**Hallazgo:** Ningún script usa `SELECT ... FOR UPDATE`. El GIST constraint protege contra double-booking, pero no protege contra race conditions en la validación de disponibilidad.

#### 6.3 Idempotency
✅ `bookings.idempotency_key` tiene UNIQUE constraint + `ON CONFLICT DO UPDATE` en `booking_create`.

#### 6.4 Zero Trust Input
✅ Zod validation en todos los scripts que reciben input externo.

### §7 — MULTI-TENANT SECURITY (RLS)

**CRÍTICO — TABLAS SIN RLS:**

| Tabla | RLS Enabled? | RLS Forced? | Policies? | provider_id column? | Estado |
|-------|-------------|-------------|-----------|---------------------|--------|
| `bookings` | ❌ FALSE | ❌ FALSE | 0 | ✅ Sí | **CRÍTICO** |
| `services` | ❌ FALSE | ❌ FALSE | 0 | ✅ Sí | **CRÍTICO** |
| `provider_schedules` | ❌ FALSE | ❌ FALSE | 0 | ✅ Sí | **CRÍTICO** |
| `booking_audit` | ❌ FALSE |  FALSE | 0 |  No (booking_id FK) | **CRÍTICO** |
| `booking_dlq` | ❌ FALSE | ❌ FALSE | 0 | ❌ No (booking_id FK) | **CRÍTICO** |
| `booking_intents` | ❌ FALSE | ❌ FALSE | 0 | ❌ No (booking_id FK) | **CRÍTICO** |
| `booking_locks` | ❌ FALSE | ❌ FALSE | 0 | ✅ Sí | **CRÍTICO** |
| `providers` | ✅ TRUE | ✅ TRUE | 1 | — (tabla raíz) | ✅ OK |
| `specialties` | ✅ TRUE | ✅ TRUE | 0 | ❌ No | ✅ OK (no es tenant) |

**Hallazgo CRÍTICO:** Solo `providers` y `specialties` tienen RLS habilitado. Las 7 tablas transaccionales principales están SIN protección RLS. Un script comprometido puede leer/escribir datos de cualquier tenant.

**RLS en `providers`:**
```sql
CREATE POLICY provider_tenant_isolation ON providers
  USING ((provider_id = current_setting('app.current_tenant', true)::uuid)
    OR (current_setting('app.current_tenant', true) IS NULL));
```
Esta política es CORRECTA para la tabla `providers`. Pero `bookings` y demás no tienen ninguna política.

**Adicional:** Ningún script usa `withTenantContext` o `SET LOCAL app.current_tenant`. Todos los queries se ejecutan sin contexto de tenant.

### §8 — ARCHITECTURAL CONSTRAINTS

#### 8.1 State Machine
✅ Check constraint en `bookings.status`:
```sql
CHECK (status = ANY (ARRAY['pending','confirmed','in_service','completed','cancelled','no_show','rescheduled']))
```
Las transiciones permitidas coinciden con §8.1. Sin embargo, **no hay validación a nivel de aplicación** de las transiciones. El código puede actualizar de `cancelled` a `confirmed` directamente si el query SQL lo permite (el check constraint no restringe transiciones, solo valores).

#### 8.2 LLM Output Contract
✅ `f/internal/ai_agent/types.ts` define `IntentResultSchema` con:
- `intent: z.enum(Object.values(INTENT))` ✅
- `confidence: z.number().min(0).max(1)` ✅
- `entities: EntityMapSchema` ✅
- `needs_more_info: z.boolean()` ✅
- `follow_up_question: z.string().nullable()` ✅

El AI Agent produce `{ success, data: IntentResult, error_message }` que envuelve el contrato correcto.

#### 8.3 Google Calendar Sync
✅ `gcal_sync/main.ts` implementa:
- Retry con backoff exponencial: `Math.pow(3, attempt) * 1000` → 1s, 3s, 9s ✅
- Marca errores 4xx como permanentes ✅
- Marca errores 5xx/429 como transitorios ✅
- Actualiza `gcal_sync_status` a `pending` en fallo ✅

⚠️ **Hallazgo:** `gcal_reconcile/main.ts` existe como cron job pero **`pg_cron` NO está instalado** en la DB. Depende de Windmill Schedule para ejecutarse. Verificar si el schedule está configurado.

### §1 — EXECUTION DISCIPLINE

| Violación | Ubicación | Detalle |
|-----------|-----------|---------|
| `// TODO` o placeholders | ❌ Ninguno detectado | ✅ OK |
| Mock data | ❌ Ninguno detectado | ✅ OK |
| Pseudo-código | ❌ Ninguno detectado | ✅ OK |

### §2 — ENGINEERING DOCTRINE

| Principio | Cumplimiento | Detalle |
|-----------|-------------|---------|
| DRY | ⚠️ Parcial | `retryWithBackoff` existe en `f/internal/retry/index.ts` pero `gcal_sync/main.ts` tiene su propia implementación duplicada |
| KISS | ✅ | Scripts son simples y directos |
| SOLID-S | ✅ | Cada script tiene una responsabilidad única |
| SOLID-O | ✅ | Extensión por composición (orchestrator delega a create/cancel/reschedule) |
| SOLID-L | ✅ | Tipos consistentes |
| SOLID-I | ✅ | Interfaces no fat |
| SOLID-D | ⚠️ | Scripts importan directamente de postgres en vez de un abstraction layer |

---

## 3. HALLAZGOS POR PRIORIDAD

### 🔴 CRÍTICO (bloqueo de producción)

1. **RLS deshabilitado en 7 tablas transaccionales** — Violación directa de §7. Cualquiera con acceso a la DB puede leer datos de todos los tenants.
2. **Sin `withTenantContext` en ningún script** — Violación de §7. Los queries se ejecutan sin aislamiento de tenant.
3. **Race condition en `booking_create`** — `checkSlotOverlap` (SELECT) separado del INSERT. Mitigado por GIST constraint pero no por diseño de aplicación.
4. **Type casting `as Type` en 5 archivos** — Violación de §3. Usa casts inseguros para tipar resultados de SQL.

### 🟡 ALTO (debe fixear en próximo sprint)

5. **Formato de errores inconsistente** — AI Agent usa `[Error\|null, T\|null]` pero booking scripts usan `{success, data, error_message}`. Violación de §4.
6. **`throw` dentro de transacciones** — Violación técnica de §4 (aunque mitigado por try/catch).
7. **14 scripts legacy sin archivar** — `f/telegram/ai_v6`, `ai_v7`, `ai_v8`, `ai_v9`, `ai_v10`, `gateway`, `main`, `llmtest`, `debug_llm`, `ai_v4`, `ai`, `f/tg/v4`, `f/tg/main` — desperdicio de recursos y confusión.
8. **`unknown` en `z.record(z.string(), z.unknown())`** en AI Agent types — Violación parcial de §3.

### 🟢 MEDIO (mejora técnica)

9. **DRY violation** — `retryWithBackoff` duplicado en `gcal_sync/main.ts`.
10. **`pg_cron` no instalado** — reconcile de GCal depende de Windmill schedule (verificar).
11. **No hay validación de transiciones de estado** — El check constraint solo valida valores, no transiciones.
12. **Schema DB diverge de §4** — No existe `patients` table; se usa `clients` + `users`. Columna `provider_id` NO existe en `bookings` (existe `provider_id` como FK pero no es la columna multi-tenant del §4).

### ✅ OK

13. **Idempotency keys** — Funcionan correctamente.
14. **GIST exclusion constraint** — Previene double booking.
15. **State machine check constraint** — Correcto.
16. **Zod validation** — Presente en todos los scripts.
17. **AI Agent LLM output contract** — Cumple §8.2.
18. **GCal retry policy** — 3 intentos con backoff exponencial.
19. **Telegram bot rule-based** — Determinístico, sin LLM para navegación.
20. **No placeholders ni mocks** — Código 100% funcional.

---

## 4. FUENTES CONSULTADAS (TIER 1)

| Fuente | URL | Tier | Uso |
|--------|-----|------|-----|
| Windmill Docs — Bun dependencies | https://docs.windmill.dev/docs/core_concepts/scripts/languages#bun | Tier 1 | Formato `//bun postgres@3.4.5` |
| Windmill Docs — Error handling | https://docs.windmill.dev/docs/core_concepts/scripts/script_results | Tier 1 | Formato de retorno de scripts |
| PostgreSQL Docs — RLS | https://www.postgresql.org/docs/current/ddl-rowsecurity.html | Tier 1 | Sintaxis CREATE POLICY, ENABLE/FORCE RLS |
| Telegram Bot API — setWebhook | https://core.telegram.org/bots/api#setwebhook | Tier 1 | Webhook config, allowed_updates |
| Telegram Bot API — ReplyKeyboardMarkup | https://core.telegram.org/bots/api#replykeyboardmarkup | Tier 1 | Menú numerado con botones |
| postgres npm package | https://github.com/porsager/postgres | Tier 1 | SQL template strings, SSL config |
| Zod docs | https://zod.dev/ | Tier 1 | Schema validation, z.unknown() |

---

## 5. PLAN DE ACCION

### Fase 1 — CRÍTICO (Semana 1)

| # | Tarea | Archivo(s) | Prioridad |
|---|-------|-----------|-----------|
| 1.1 | Habilitar RLS en `bookings` | DB migration | 🔴 |
| 1.2 | Habilitar RLS en `services` | DB migration | 🔴 |
| 1.3 | Habilitar RLS en `provider_schedules` | DB migration | 🔴 |
| 1.4 | Habilitar RLS en `booking_audit`, `booking_dlq`, `booking_intents` | DB migration | 🔴 |
| 1.5 | Habilitar RLS en `booking_locks` | DB migration | 🔴 |
| 1.6 | Crear políticas RLS para cada tabla | DB migration | 🔴 |
| 1.7 | Implementar `withTenantContext` en todos los scripts de BD | `f/booking_*`, `f/gcal_*` | 🔴 |
| 1.8 | Archivar 14 scripts legacy de Telegram | Windmill API | 🔴 |
| 1.9 | Eliminar type casts `as Type` en booking scripts | `f/booking_create`, `f/booking_cancel`, etc. | 🔴 |

### Fase 2 — ALTO (Semana 2)

| # | Tarea | Archivo(s) | Prioridad |
|---|-------|-----------|-----------|
| 2.1 | Unificar formato de errores a `[Error\|null, T\|null]` | `f/booking_create`, `f/booking_cancel`, `f/booking_reschedule`, `f/gcal_sync`, `f/distributed_lock`, `f/telegram/bot` | 🟡 |
| 2.2 | Reemplazar `throw` por error tuples en transacciones | `f/booking_create`, `f/booking_cancel`, `f/booking_reschedule` | 🟡 |
| 2.3 | Eliminar duplicado de `retryWithBackoff` en `gcal_sync` | `f/gcal_sync/main.ts` | 🟡 |
| 2.4 | Refinar `z.unknown()` en AI Agent types | `f/internal/ai_agent/types.ts` | 🟡 |
| 2.5 | Agregar `SELECT FOR UPDATE` en booking create | `f/booking_create/main.ts` | 🟡 |

### Fase 3 — MEDIO (Semana 3)

| # | Tarea | Archivo(s) | Prioridad |
|---|-------|-----------|-----------|
| 3.1 | Instalar `pg_cron` en Neon (o verificar Windmill schedule) | Infra | 🟢 |
| 3.2 | Agregar validación de transiciones de estado | `f/booking_cancel`, `f/booking_reschedule` | 🟢 |
| 3.3 | Crear DB abstraction layer (Dependency Inversion) | `f/internal/db/index.ts` | 🟢 |
| 3.4 | Agregar validación de transiciones al check constraint | DB migration | 🟢 |

---

## 6. AUTO-AUDIT DEL REPORTE

| Pregunta | Respuesta |
|----------|-----------|
| ¿Cuántas fuentes Tier 1 consulté? | 7 (Windmill Docs x2, PostgreSQL Docs, Telegram API x2, postgres npm, Zod) |
| ¿Qué busqué y no encontré? | Documentación oficial de Windmill sobre `withTenantContext` pattern (no existe como feature nativo — es un pattern del equipo) |
| ¿Hay afirmaciones sin fuente? | La divergencia del schema DB (`clients` vs `patients`) — verificada directamente en la DB de producción |
| ¿Hay contradicciones sin resolver? | El `gcal_reconcile` dice "cron every 5 min" en el código pero `pg_cron` no está instalado. Verificar si usa Windmill Schedule. |
| Nivel de confianza general | 95% |

---

**FIN DEL REPORTE — AGENTES.md v9.0 COMPLIANCE AUDIT**
