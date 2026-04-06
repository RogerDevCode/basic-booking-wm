# 🔴 AUDITORÍA CRÍTICA — Código vs Producción

**Fecha:** 2026-04-06
**Alcance:** Todos los scripts TypeScript vs esquema de producción en Neon

---

## ✅ LO QUE SE ARREGLÓ EN ESTA EJECUCIÓN

### Columnas Agregadas a `bookings`

| Columna | Tipo | Default | Estado |
|---------|------|---------|--------|
| `booking_id` | UUID | `gen_random_uuid()` | ✅ Renombrada de `id` |
| `gcal_sync_status` | TEXT | `'pending'` | ✅ Creada |
| `notification_sent` | BOOLEAN | `false` | ✅ Creada |
| `cancelled_by` | TEXT | NULL | ✅ Creada |
| `rescheduled_from` | UUID → bookings | NULL | ✅ Creada |
| `gcal_retry_count` | INT | `0` | ✅ Creada |

---

## 🔴 PROBLEMAS CRÍTICOS DETECTADOS (NO ARREGLADOS)

### 1. Type Mismatches en Foreign Keys

| Tabla.Columna | Tipo Actual | Tipo Esperado | Referencia |
|---------------|-------------|---------------|------------|
| `booking_dlq.booking_id` | **integer** | **uuid** | `bookings.booking_id` |
| `booking_dlq.provider_id` | **integer** | **uuid** | `providers.id` |
| `booking_dlq.service_id` | **integer** | **uuid** | `services.id` |
| `booking_intents.booking_id` | **integer** | **uuid** | `bookings.booking_id` |
| `booking_intents.provider_id` | **integer** | **uuid** | `providers.id` |
| `booking_intents.service_id` | **integer** | **uuid** | `services.id` |
| `booking_locks.provider_id` | **integer** | **uuid** | `providers.id` |

**Impacto:** Estas tablas NO pueden tener FK constraints porque los tipos no coinciden.
Si el código intenta hacer JOIN entre `booking_dlq.booking_id` (integer) y `bookings.booking_id` (uuid), **PostgreSQL lanzará un error de tipo**.

**Origen:** Estas tablas fueron creadas con un schema viejo (integer IDs) antes de la migración a UUID.

### 2. Columnas Huérfanas (0 referencias en código)

| Tabla.Columna | Referencias en Código | Acción Sugerida |
|---------------|----------------------|-----------------|
| `booking_dlq.customer_id` | **0** | 🗑️ Eliminar (legacy) |
| `booking_intents.customer_id` | **0** | 🗑️ Eliminar (legacy) |
| `services.min_lead_booking_hours` | **0** | 🗑️ Eliminar (no usado) |
| `services.min_lead_cancel_hours` | **0** | 🗑️ Eliminar (no usado) |

### 3. Columnas con Nombres Inconsistentes

| Código Esperado | Producción Real | Estado |
|-----------------|-----------------|--------|
| `providers.provider_id` | `providers.id` (PK) + `providers.provider_id` (UUID nullable) | ⚠️ Duplicado confuso |
| `bookings.booking_id` | ✅ Ahora coincide | ✅ Arreglado |
| `services.provider_id` | ✅ Ahora existe | ✅ Arreglado |

---

## ✅ FOREIGN KEYS — Todas Válidas (15)

| FK | Referencia | Estado |
|----|------------|--------|
| `booking_audit.booking_id` → `bookings.booking_id` | ✅ OK |
| `bookings.client_id` → `clients.client_id` | ✅ OK |
| `bookings.provider_id` → `providers.id` | ✅ OK |
| `bookings.rescheduled_from` → `bookings.booking_id` | ✅ OK |
| `bookings.service_id` → `services.id` | ✅ OK |
| `bookings.user_id` → `users.chat_id` | ✅ OK |
| `conversations.user_id` → `users.chat_id` | ✅ OK |
| `provider_schedules.provider_id` → `providers.id` | ✅ OK |
| `schedule_overrides.provider_id` → `providers.provider_id` | ✅ OK |
| `service_notes.booking_id` → `bookings.booking_id` | ✅ OK |
| `service_notes.client_id` → `clients.client_id` | ✅ OK |
| `service_notes.provider_id` → `providers.provider_id` | ✅ OK |
| `services.provider_id` → `providers.provider_id` | ✅ OK |
| `users.timezone_id` → `timezones.id` | ✅ OK |
| `waitlist.user_id` → `users.chat_id` | ✅ OK |

---

## 🔍 SEGURIDAD SQL — Análisis Real

### ✅ Lo que está bien

1. **`sql\`...\`` (tagged template literals)** — La mayoría de los queries usan parámetros seguros
2. **No hay credenciales hardcodeadas** — Todas vienen de `process.env`
3. **No hay mocks ni datos dummy** en el código de producción

### ⚠️ Lo que es problemático

1. **`sql.unsafe()` con string concatenation** en `booking_search/main.ts`:
   ```typescript
   // LÍNEA 101-115 — CONSTRUYE WHERE DINÁMICAMENTE
   conditions.push('b.provider_id = $' + String(paramIdx) + '::uuid');
   const countRows = await sql.unsafe(
     'SELECT COUNT(*) as total FROM bookings b ' + whereClause,
     params
   );
   ```
   Aunque los **valores** son parametrizados (`params` array), la **estructura SQL** se construye por concatenación de strings. Esto no es SQL injection directo, pero:
   - Bypass del type checking de postgres.js
   - Si `paramIdx` se corrompe, podría generar SQL inválido
   - No hay validación de que `conditions` solo contenga fragmentos seguros

2. **`tx.unsafe()` en booking_create, booking_cancel, booking_reschedule**:
   ```typescript
   await tx.unsafe(
     `INSERT INTO bookings (...) VALUES ($1, $2, ...)`,
     [val1, val2, ...]
   );
   ```
   Mismo patrón — los valores son seguros pero el SQL raw string bypassa el sistema de tipos.

---

## 📊 RESUMEN DE ESTADO

| Métrica | Valor |
|---------|-------|
| **Tablas en producción** | 23 |
| **Foreign keys válidas** | 15/15 ✅ |
| **Columnas mismatch (tipo)** | 7 🔴 |
| **Columnas huérfanas** | 4 🟡 |
| **Scripts usando sql.unsafe()** | 9 🟡 |
| **Scripts con SQL concatenado** | 1 🟡 |
| **Credenciales hardcodeadas** | 0 ✅ |
| **Mocks en producción** | 0 ✅ |
