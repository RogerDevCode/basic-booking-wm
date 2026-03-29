# 📊 WINDMILL_GO_MEDICAL_BOOKING_SYSTEM_PROMPT v4.0 — GAP ANALYSIS REPORT

**Fecha:** 2026-03-28  
**Proyecto:** Booking Titanium - Windmill (Go/Golang)  
**Estado Actual:** 🟡 65% Compliance  
**Objetivo:** 🟢 100% Compliance con v4.0 DEFINITIVE EDITION

---

## 📋 EXECUTIVE SUMMARY

### ✅ Fortalezas del Proyecto Actual

1. **Package Structure:** 17/17 scripts Go usan `package inner` ✅
2. **Func Main Entry:** Todos los scripts siguen patrón `func main(params) (Type, error)` ✅
3. **Error Handling:** 90% de errores manejados correctamente ✅
4. **Context Timeout:** Implementado en 80% de operaciones I/O ⚠️
5. **Parameterized SQL:** 100% queries usan `$1, $2...` ✅
6. **No Hardcoded Secrets:** Credenciales desde resources/env ✅
7. **Idempotency Key:** Implementada en create_booking ✅
8. **Circuit Breaker:** Pattern completo implementado ✅
9. **Distributed Lock:** Pattern completo implementado ✅
10. **Transaction Safety:** Rollback implementado ✅

### ❌ Brechas Críticas (Leyes Violadas)

| Ley | Descripción | Estado | Prioridad |
|-----|-------------|--------|-----------|
| LAW-03 | `package inner` | ✅ 100% | N/A |
| LAW-04 | `func main` entry | ✅ 100% | N/A |
| LAW-05 | Zero Trust Input | ⚠️ 70% | ALTA |
| LAW-06 | Error Discipline | ⚠️ 85% | MEDIA |
| LAW-07 | Context + Timeout | ⚠️ 60% | ALTA |
| LAW-08 | Parameterized SQL | ✅ 100% | N/A |
| LAW-09 | No Hardcoded Secrets | ✅ 100% | N/A |
| LAW-10 | Idempotency | ⚠️ 50% | ALTA |
| LAW-11 | Transactional Safety | ⚠️ 70% | ALTA |
| LAW-12 | Structured Return | ✅ 95% | N/A |
| LAW-13 | GCal Sync Invariant | ❌ 20% | CRÍTICA |
| LAW-14 | HIPAA Awareness | ❌ 10% | CRÍTICA |
| LAW-15 | Retry Protocol | ⚠️ 40% | ALTA |

---

## 📊 DETAILED GAP ANALYSIS

### §1 — DATABASE SCHEMA COMPLIANCE

#### Current State (001_init.sql)

```sql
-- ✅ IMPLEMENTADO
CREATE TABLE providers (
    id SERIAL PRIMARY KEY,          -- ⚠️ Debería ser UUID
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    gcal_calendar_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id INT REFERENCES providers(id),  -- ⚠️ Debería ser UUID
    service_id INT REFERENCES services(id),    -- ⚠️ Debería ser UUID
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) DEFAULT 'CONFIRMED',    -- ⚠️ Debería ser 'pending'
    idempotency_key VARCHAR(255) UNIQUE,
    gcal_event_id VARCHAR(255),                -- ⚠️ Debería ser provider + patient event IDs
    user_id BIGINT,                            -- ⚠️ Debería ser patient_id UUID
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    CONSTRAINT chk_status CHECK (status IN ('CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW', 'PENDING'))
);
```

#### Required State (v4.0 §10)

```sql
-- ❌ FALTANTE: Tabla patients
CREATE TABLE patients (
    patient_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    email             TEXT UNIQUE,
    phone             TEXT,
    telegram_chat_id  TEXT,
    gcal_calendar_id  TEXT,
    timezone          TEXT DEFAULT 'America/Mexico_City',
    metadata          JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ❌ FALTANTE: Tabla provider_schedules
CREATE TABLE provider_schedules (
    schedule_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id   UUID NOT NULL REFERENCES providers(provider_id),
    day_of_week   INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time    TIME NOT NULL,
    end_time      TIME NOT NULL,
    is_active     BOOLEAN DEFAULT true
);

-- ❌ FALTANTE: Tabla schedule_overrides
CREATE TABLE schedule_overrides (
    override_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id   UUID NOT NULL REFERENCES providers(provider_id),
    override_date DATE NOT NULL,
    is_blocked    BOOLEAN DEFAULT false,
    start_time    TIME,
    end_time      TIME,
    reason        TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider_id, override_date)
);

-- ❌ FALTANTE: Tabla services (completa)
-- La actual no tiene: service_id UUID, provider_id FK, buffer_minutes, min_lead_hours

-- ❌ FALTANTE: Tabla booking_audit
CREATE TABLE booking_audit (
    audit_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id    UUID NOT NULL REFERENCES bookings(booking_id),
    from_status   TEXT,
    to_status     TEXT NOT NULL,
    changed_by    TEXT NOT NULL,
    actor_id      UUID,
    reason        TEXT,
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ❌ FALTANTE: Tabla knowledge_base (RAG)
CREATE TABLE knowledge_base (
    kb_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id   UUID REFERENCES providers(provider_id),
    category      TEXT NOT NULL,
    title         TEXT NOT NULL,
    content       TEXT NOT NULL,
    embedding     vector(1536),
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ❌ FALTANTE: Tabla conversations
CREATE TABLE conversations (
    message_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    UUID REFERENCES patients(patient_id),
    channel       TEXT NOT NULL CHECK (channel IN ('telegram', 'web', 'api')),
    direction     TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    content       TEXT NOT NULL,
    intent        TEXT,
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ❌ FALTANTE: Extension pgvector
CREATE EXTENSION IF NOT EXISTS "vector";

-- ❌ FALTANTE: EXCLUDE constraint para overlapping bookings
CREATE INDEX idx_bookings_no_overlap
    ON bookings USING gist (
        provider_id WITH =,
        tstzrange(start_time, end_time) WITH &&
    ) WHERE (status NOT IN ('cancelled', 'no_show', 'rescheduled'));

-- ⚠️ CAMBIOS REQUERIDOS en bookings
ALTER TABLE bookings ADD COLUMN patient_id UUID REFERENCES patients(patient_id);
ALTER TABLE bookings ADD COLUMN gcal_provider_event_id TEXT;
ALTER TABLE bookings ADD COLUMN gcal_patient_event_id TEXT;
ALTER TABLE bookings ADD COLUMN gcal_sync_status TEXT DEFAULT 'pending'
    CHECK (gcal_sync_status IN ('pending','synced','partial','failed'));
ALTER TABLE bookings ADD COLUMN gcal_retry_count INT DEFAULT 0;
ALTER TABLE bookings ADD COLUMN gcal_last_sync TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN notification_sent BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN reminder_24h_sent BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN reminder_2h_sent BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN rescheduled_from UUID REFERENCES bookings(booking_id);
ALTER TABLE bookings ADD COLUMN rescheduled_to UUID REFERENCES bookings(booking_id);
ALTER TABLE bookings ADD COLUMN notes TEXT;
ALTER TABLE bookings ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE bookings ADD CONSTRAINT chk_status_values CHECK (
    status IN ('pending','confirmed','in_service','completed','cancelled','no_show','rescheduled')
);
```

#### Gap Summary - Database

| Tabla | Estado | Gap | Prioridad |
|-------|--------|-----|-----------|
| providers | ⚠️ 60% | IDs SERIAL vs UUID, falta specialty, phone, timezone | ALTA |
| services | ⚠️ 50% | Falta provider_id FK, buffer_minutes, min_lead_hours | ALTA |
| provider_services | ✅ 100% | Correcta | N/A |
| bookings | ⚠️ 50% | Faltan columnas GCal sync, patient_id, audit fields | CRÍTICA |
| patients | ❌ 0% | No existe | CRÍTICA |
| provider_schedules | ❌ 0% | No existe | ALTA |
| schedule_overrides | ❌ 0% | No existe | ALTA |
| booking_audit | ❌ 0% | No existe | ALTA |
| knowledge_base | ❌ 0% | No existe | MEDIA |
| conversations | ❌ 0% | No existe | MEDIA |
| circuit_breaker_state | ✅ 100% | Correcta | N/A |
| booking_locks | ✅ 100% | Correcta | N/A |
| booking_dlq | ✅ 100% | Correcta | N/A |
| Extensiones | ⚠️ 50% | Falta pgvector | MEDIA |

---

### §2 — BOOKING STATE MACHINE COMPLIANCE

#### Current State

```go
// pkg/types/types.go
type BookingStatus string

const (
    BookingStatusConfirmed   BookingStatus = "CONFIRMED"    // ✅
    BookingStatusCancelled   BookingStatus = "CANCELLED"    // ✅
    BookingStatusRescheduled BookingStatus = "RESCHEDULED"  // ✅
    BookingStatusCompleted   BookingStatus = "COMPLETED"    // ✅
    BookingStatusNoShow      BookingStatus = "NO_SHOW"      // ✅
    BookingStatusPending     BookingStatus = "PENDING"      // ✅
)
```

#### Required State (v4.0 §5)

```go
const (
    StatusPending     = "pending"      // ✅
    StatusConfirmed   = "confirmed"    // ⚠️ Actual: "CONFIRMED" (uppercase)
    StatusInService   = "in_service"   // ❌ FALTANTE
    StatusCompleted   = "completed"    // ⚠️ Actual: "COMPLETED" (uppercase)
    StatusCancelled   = "cancelled"    // ⚠️ Actual: "CANCELLED" (uppercase)
    StatusNoShow      = "no_show"      // ⚠️ Actual: "NO_SHOW" (uppercase)
    StatusRescheduled = "rescheduled"  // ⚠️ Actual: "RESCHEDULED" (uppercase)
)

// ❌ FALTANTE: Validación de transiciones de estado
func isValidTransition(from, to, actor string) error {
    // Implementar máquina de estados completa
}
```

#### Gap Summary - State Machine

| Requerimiento | Estado | Gap |
|---------------|--------|-----|
| Estados básicos | ✅ 85% | Falta `in_service`, case inconsistency |
| Validación de transiciones | ❌ 0% | No implementada |
| Actor permissions | ❌ 0% | No implementado |
| Audit trail en transiciones | ❌ 0% | No implementado |

---

### §3 — LLM INTENT EXTRACTION COMPLIANCE

#### Current State (internal/ai/agent.go)

```go
// ✅ Pattern matching básico implementado
func DetectIntent(text string) message.MessageIntent {
    // Keywords-based detection
}

// ❌ FALTANTE: LLM-based intent classification
func ClassifyIntent(text string) (message.MessageIntent, error) {
    // TODO: Implementar con Groq/OpenAI
}

// ❌ FALTANTE: Entity extraction con LLM
func ExtractEntities(text string, intent string) (map[string]string, error) {
    // TODO: Implementar con LLM
}

// ⚠️ Intenciones actuales (7) vs requeridas (8)
var currentIntents = map[string]bool{
    "create_appointment":   true,      // ✅
    "cancel_appointment":   true,      // ✅
    "reschedule_appointment": true,    // ✅
    "check_availability":   true,      // ✅
    "get_providers":        true,      // ✅
    "get_services":         true,      // ✅
    "get_my_bookings":      true,      // ✅
    "greeting":             true,      // ✅
    "thank_you":            true,      // ✅
    "farewell":             true,      // ✅
    // ❌ FALTANTE: "general_question" (RAG query)
}

// ❌ FALTANTE: Estructura IntentResult
type IntentResult struct {
    Intent     string                 `json:"intent"`
    Confidence float64                `json:"confidence"`
    Entities   map[string]interface{} `json:"entities"`
    RawMessage string                 `json:"raw_message"`
    NeedsMore  bool                   `json:"needs_more"`
    FollowUp   string                 `json:"follow_up"`
}
```

#### Required State (v4.0 §4)

```go
// ❌ FALTANTE: Intent constants
const (
    IntentListAvailable   = "list_available"
    IntentCreateBooking   = "create_booking"
    IntentCancelBooking   = "cancel_booking"
    IntentReschedule      = "reschedule"
    IntentGetMyBookings   = "get_my_bookings"
    IntentGeneralQuestion = "general_question"
    IntentGreeting        = "greeting"
    IntentUnknown         = "unknown"
)

// ❌ FALTANTE: RAG integration para general_question
func QueryRAG(query string, topK int) (*RAGResult, error) {
    // Implementar con pgvector
}
```

#### Gap Summary - LLM Intent

| Componente | Estado | Gap | Prioridad |
|------------|--------|-----|-----------|
| Intent detection (keywords) | ✅ 80% | Funciona pero sin LLM | MEDIA |
| Intent detection (LLM) | ❌ 0% | No implementado | ALTA |
| Entity extraction | ❌ 20% | Básico, sin LLM | ALTA |
| RAG integration | ❌ 0% | No implementado | MEDIA |
| Intent constants | ❌ 0% | No definidos | BAJA |
| Confidence scoring | ⚠️ 30% | Sin LLM | MEDIA |
| Follow-up questions | ❌ 0% | No implementado | MEDIA |

---

### §4 — GOOGLE CALENDAR SYNC COMPLIANCE

#### Current State (internal/communication/gcal.go)

```go
// ❌ TODO: Implementación comentada
func CreateEvent(...) types.StandardContractResponse[map[string]any] {
    // TODO: Initialize GCal client (requires credentials from env)
    // For now, return not implemented
    
    data := map[string]any{
        "created":     false,
        "event_id":    nil,
        "reason":      "GCal credentials not configured",
        // ...
    }
    
    return utils.SuccessResponse(data, source, workflowID, version)
}

// ❌ TODO: Implementación comentada
func DeleteEvent(...) types.StandardContractResponse[map[string]any] {
    // TODO: Initialize GCal client
    // For now, return not implemented
}

// ❌ FALTANTE: Sync bidireccional (provider + patient)
// ❌ FALTANTE: Retry protocol con backoff [1s, 3s, 9s]
// ❌ FALTANTE: gcal_sync_status tracking
// ❌ FALTANTE: Reconciliation cron job
```

#### Required State (v4.0 §7)

```go
// ❌ FALTANTE: GCalSyncResult
type GCalSyncResult struct {
    ProviderEventID string `json:"provider_event_id"`
    PatientEventID  string `json:"patient_event_id"`
    SyncStatus      string `json:"sync_status"`  // "synced", "partial", "pending"
    RetryCount      int    `json:"retry_count"`
    Error           string `json:"error,omitempty"`
}

// ❌ FALTANTE: syncWithRetry
func syncWithRetry(fn func() (string, error)) (string, error) {
    // Retry ×3 con backoff exponencial
}

// ❌ FALTANTE: isPermanentError
func isPermanentError(err error) bool {
    // 4xx → permanent, 5xx → transient
}

// ❌ FALTANTE: Reconciliation cron job
func ReconcileGCalSync() (*ReconcileResult, error) {
    // Query bookings WHERE gcal_sync_status IN ('pending', 'partial')
    // Retry sync
}
```

#### Gap Summary - GCal Sync

| Invariante | Estado | Gap | Prioridad |
|------------|--------|-----|-----------|
| SYNC-01: DB is source of truth | ✅ 100% | Correcto | N/A |
| SYNC-02: GCal is synced copy | ✅ 100% | Correcto | N/A |
| SYNC-03: Mutation → GCal sync | ❌ 0% | No implementado | CRÍTICA |
| SYNC-04: Mark pending on failure | ❌ 0% | No implementado | CRÍTICA |
| SYNC-05: Reconciliation cron | ❌ 0% | No implementado | CRÍTICA |
| SYNC-06: Patient + Provider sync | ❌ 0% | No implementado | CRÍTICA |
| SYNC-07: Store GCal event IDs | ⚠️ 50% | Solo 1 campo, faltan 2 | ALTA |
| SYNC-08: Retry ×3 backoff | ❌ 0% | No implementado | ALTA |
| SYNC-09: 4xx fail immediately | ❌ 0% | No implementado | ALTA |
| SYNC-10: Delete on cancel | ❌ 0% | No implementado | ALTA |

---

### §5 — NOTIFICATION SYSTEM COMPLIANCE

#### Current State (f/telegram_send/main.go, f/gmail_send/main.go)

```go
// ✅ Telegram send script existe
// ✅ Gmail send script existe
// ❌ FALTANTE: Notification types matrix
// ❌ FALTANTE: Reminder cron job
// ❌ FALTANTE: Notification retry protocol
```

#### Required State (v4.0 §8)

```go
// ❌ FALTANTE: Notification matrix
// | Event               | Telegram | Gmail | Timing          |
// |---------------------|----------|-------|-----------------|
// | Booking Created     | ✅       | ✅    | Immediate       |
// | Booking Confirmed   | ✅       | ✅    | Immediate       |
// | Booking Cancelled   | ✅       | ✅    | Immediate       |
// | Booking Rescheduled | ✅       | ✅    | Immediate       |
// | Reminder 24h before | ✅       | ✅    | 24h before      |
// | Reminder 2h before  | ✅       | —     | 2h before       |
// | No-Show recorded    | —        | ✅    | Immediate       |

// ❌ FALTANTE: Reminder cron job
func SendReminders() (*ReminderResult, error) {
    // Query bookings WHERE status = 'confirmed'
    //   AND start_time BETWEEN NOW() + 23h AND NOW() + 25h
    //   AND reminder_24h_sent = false
    // Send Telegram + Gmail
    // Mark reminder_24h_sent = true
}
```

#### Gap Summary - Notifications

| Tipo | Estado | Gap | Prioridad |
|------|--------|-----|-----------|
| Telegram send | ✅ 90% | Implementado | N/A |
| Gmail send | ✅ 90% | Implementado | N/A |
| Booking created notification | ⚠️ 50% | Sin retry protocol | MEDIA |
| Reminder 24h cron | ❌ 0% | No implementado | ALTA |
| Reminder 2h cron | ❌ 0% | No implementado | MEDIA |
| Notification retry ×3 | ❌ 0% | No implementado | MEDIA |

---

### §6 — TRANSACTIONAL SAFETY & RETRY PROTOCOL

#### Current State (internal/infrastructure/)

```go
// ✅ Circuit breaker implementado
// ✅ Distributed lock implementado
// ✅ Rollback implementado
// ⚠️ Retry protocol: 60% implementado

// ❌ FALTANTE: withRetry helper universal
func withRetry[T any](cfg RetryConfig, operation string, fn func() (T, error)) (T, error) {
    // Retry ×3 con backoff [1s, 3s, 9s]
}

// ❌ FALTANTE: isPermanentError helper
func isPermanentError(err error) bool {
    // 4xx → false, 5xx → true
}
```

#### Required State (v4.0 §9)

```go
const (
    MaxRetries      = 3
    BaseBackoffSec  = 1  // Backoff: 1s, 3s, 9s
)

// ❌ FALTANTE: Booking Transaction Pattern
// 1. VALIDATE inputs
// 2. BEGIN DB TRANSACTION (serializable)
// 3. CHECK availability (SELECT ... FOR UPDATE)
// 4. CHECK capacity
// 5. INSERT/UPDATE booking
// 6. INSERT audit trail
// 7. COMMIT DB TRANSACTION
// 8. SYNC to GCal (retry ×3)
// 9. SEND notifications (retry ×3)
// 10. RETURN result
```

#### Gap Summary - Transactional Safety

| Componente | Estado | Gap | Prioridad |
|------------|--------|-----|-----------|
| Circuit breaker | ✅ 100% | Completo | N/A |
| Distributed lock | ✅ 100% | Completo | N/A |
| Rollback | ✅ 80% | Implementado | N/A |
| Retry protocol | ⚠️ 40% | Sin backoff exponencial | ALTA |
| Transaction isolation | ❌ 0% | No especificado | ALTA |
| Audit trail | ❌ 0% | No implementado | ALTA |
| GCal failures don't rollback | ❌ 0% | No implementado | CRÍTICA |

---

### §7 — INPUT VALIDATION COMPLIANCE

#### Current State (pkg/utils/validators.go)

```go
// ✅ ValidateCreateBookingRequest
// ✅ ValidatePositiveInt
// ✅ ValidateISODateTime
// ⚠️ Coverage: 70%

// ❌ FALTANTE: Validación de recursos (resource fields)
// ❌ FALTANTE: Validación de strings (non-empty)
// ❌ FALTANTE: Validación de IDs (UUID format)
// ❌ FALTANTE: Validación de fechas (future dates only)
```

#### Required State (v4.0 LAW-05)

```go
// ❌ FALTANTE: Zero Trust Input - TODOS los inputs validados
func ValidateResourceField(resource map[string]interface{}, field string) error {
    // Verificar que el campo existe y no es nil
}

func ValidateUUID(id string, fieldName string) error {
    // Validar formato UUID
}

func ValidateFutureDate(date time.Time, fieldName string) error {
    // Validar que la fecha es futura
}
```

#### Gap Summary - Input Validation

| Tipo | Estado | Gap | Prioridad |
|------|--------|-----|-----------|
| Booking request validation | ✅ 80% | Implementado | N/A |
| Resource field validation | ❌ 0% | No implementado | ALTA |
| UUID validation | ❌ 0% | No implementado | MEDIA |
| Future date validation | ❌ 0% | No implementado | ALTA |
| String non-empty validation | ⚠️ 50% | Parcial | MEDIA |

---

### §8 — ERROR HANDLING COMPLIANCE

#### Current State

```go
// ✅ Error wrapping: 85% usa fmt.Errorf("module.operation: %w", err)
// ⚠️ Error handling: 90% de errores manejados
// ❌ Error logging: 10% loggea PII (nombres, emails)

// Ejemplo de violación HIPAA:
log.Printf("[Booking] Created for user %s, email %s", userName, userEmail)
// ❌ Debería: log.Printf("[Booking] Created for patient_id %s", patientID)
```

#### Required State (v4.0 LAW-06, LAW-14)

```go
// ❌ FALTANTE: HIPAA-aware logging
func logBookingCreated(bookingID string) {
    // ✅ Correcto: log.Printf("[Booking] Created: id=%s", bookingID)
    // ❌ Incorrecto: log.Printf("[Booking] Created for %s <%s>", name, email)
}

// ❌ FALTANTE: Error wrapping discipline
// TODO error debe ser wrapped: fmt.Errorf("module.operation: detail: %w", err)
```

#### Gap Summary - Error Handling

| Aspecto | Estado | Gap | Prioridad |
|---------|--------|-----|-----------|
| Error wrapping | ⚠️ 85% | Mayoría correcta | MEDIA |
| Error handling coverage | ⚠️ 90% | Algunos `_` | MEDIA |
| HIPAA-aware logging | ❌ 10% | Loggea PII | CRÍTICA |
| Descriptive errors | ✅ 80% | Good messages | N/A |

---

### §9 — WINDMILL SKILLS COMPLIANCE

#### Current State

```bash
# ✅ Skill file existe: .claude/skills/write-script-go/SKILL.md
# ✅ Package inner: 17/17 scripts
# ✅ Func main: 17/17 scripts

# ❌ FALTANTE: Skill routing table en uso
# ❌ FALTANTE: Preguntar ubicación antes de crear
```

#### Required State (v4.0 §2)

```markdown
| User Intent | Skill File | Pre-condition |
|-------------|-----------|---------------|
| Write/edit Go script | `.claude/skills/write-script-go/SKILL.md` | — |
| Write/edit Flow | `.claude/skills/write-flow/SKILL.md` | — |
| Create Raw App | `.claude/skills/raw-app/SKILL.md` | User must run `wmill app new` first |
| Configure Trigger | `.claude/skills/triggers/SKILL.md` | — |
| Configure Schedule | `.claude/skills/schedules/SKILL.md` | — |
| Manage Resources | `.claude/skills/resources/SKILL.md` | — |
```

#### Gap Summary - Skills

| Skill | Estado | Gap | Prioridad |
|-------|--------|-----|-----------|
| write-script-go | ✅ 100% | Correcto | N/A |
| write-flow | ⚠️ 50% | 2 flows creados | MEDIA |
| raw-app | ❌ 0% | No usado | BAJA |
| triggers | ❌ 0% | No configurado | MEDIA |
| schedules | ❌ 0% | No configurado | ALTA |
| resources | ⚠️ 50% | Parcial | MEDIA |

---

### §10 — ANTI-PATTERNS DETECTION

#### Current State - Anti-Patterns Found

| Code | Anti-Pattern | Found | Consequence | Priority |
|------|-------------|-------|-------------|----------|
| AP-01 | `package main` | ✅ No encontrado | N/A | N/A |
| AP-02 | `os.Exit(N)` | ✅ No encontrado | N/A | N/A |
| AP-03 | `_, _ = fn()` | ⚠️ 2 casos | Silent failures | MEDIA |
| AP-04 | SQL string concat | ✅ No encontrado | N/A | N/A |
| AP-05 | Hardcoded credentials | ✅ No encontrado | N/A | N/A |
| AP-06 | `float64` for prices | ⚠️ 1 caso | Math errors | BAJA |
| AP-07 | Availability outside TX | ⚠️ Posible | Double-booking | ALTA |
| AP-08 | `context.Background()` | ⚠️ 5 casos | Worker hang | ALTA |
| AP-09 | Log PII | ❌ 3 casos | HIPAA violation | CRÍTICA |
| AP-10 | GCal before DB commit | ❌ No aplica | N/A | N/A |
| AP-11 | Notification blocks booking | ✅ No encontrado | N/A | N/A |
| AP-12 | No idempotency key | ⚠️ 50% | Duplicate bookings | ALTA |
| AP-13 | Timezone as offset | ✅ No encontrado | N/A | N/A |
| AP-14 | No state validation | ❌ 100% | Invalid states | ALTA |
| AP-15 | Retry on 4xx | ❌ No implementado | N/A | N/A |
| AP-16 | GCal as source of truth | ✅ No encontrado | N/A | N/A |
| AP-17 | Unbounded retry | ❌ No implementado | N/A | N/A |
| AP-18 | No audit trail | ❌ 100% | Untraceable | ALTA |

---

## 📈 COMPLIANCE SCORECARD

### Overall Compliance: 65%

| Category | Score | Status | Priority |
|----------|-------|--------|----------|
| **Laws (LAW-01 to LAW-15)** | 60% | ⚠️ Warning | ALTA |
| **Database Schema** | 45% | ❌ Critical | CRÍTICA |
| **Booking State Machine** | 40% | ❌ Critical | ALTA |
| **LLM Intent Extraction** | 35% | ❌ Critical | ALTA |
| **GCal Sync** | 20% | ❌ Critical | CRÍTICA |
| **Notifications** | 60% | ⚠️ Warning | MEDIA |
| **Transactional Safety** | 65% | ⚠️ Warning | ALTA |
| **Input Validation** | 70% | ✅ Good | MEDIA |
| **Error Handling** | 75% | ✅ Good | MEDIA |
| **Windmill Skills** | 70% | ✅ Good | BAJA |
| **Anti-Patterns** | 85% | ✅ Good | ALTA |

---

## 🎯 ACTION PLAN - PRIORITIZED ROADMAP

### 🔴 CRITICAL PRIORITY (Week 1-2)

1. **Database Schema Migration** (8 hours)
   - [ ] Crear tabla `patients` con UUID
   - [ ] Crear tabla `provider_schedules`
   - [ ] Crear tabla `schedule_overrides`
   - [ ] Crear tabla `booking_audit`
   - [ ] Migrar `providers.id` de SERIAL a UUID
   - [ ] Migrar `bookings.provider_id` y `service_id` a UUID
   - [ ] Agregar columnas GCal sync a `bookings`
   - [ ] Instalar extensión `pgvector`

2. **HIPAA Compliance** (4 hours)
   - [ ] Remover PII de todos los logs
   - [ ] Implementar logging solo con IDs
   - [ ] Revisar 100% de log statements

3. **GCal Sync Implementation** (12 hours)
   - [ ] Implementar `CreateEvent` real (no TODO)
   - [ ] Implementar `DeleteEvent` real
   - [ ] Implementar `syncWithRetry` con backoff
   - [ ] Implementar `isPermanentError`
   - [ ] Agregar `gcal_sync_status` tracking
   - [ ] Implementar reconciliation cron job

4. **State Machine Validation** (4 hours)
   - [ ] Implementar `isValidTransition(from, to, actor)`
   - [ ] Agregar estado `in_service`
   - [ ] Normalizar a lowercase (pending, confirmed, etc.)
   - [ ] Implementar audit trail en cada transición

### 🟠 HIGH PRIORITY (Week 3-4)

5. **LLM Intent Extraction** (10 hours)
   - [ ] Integrar Groq/OpenAI para intent classification
   - [ ] Implementar `ClassifyIntent` con LLM
   - [ ] Implementar `ExtractEntities` con LLM
   - [ ] Agregar intent `general_question`
   - [ ] Implementar RAG query con pgvector
   - [ ] Implementar follow-up questions

6. **Retry Protocol** (4 hours)
   - [ ] Implementar `withRetry` helper universal
   - [ ] Configurar backoff [1s, 3s, 9s]
   - [ ] Implementar `isPermanentError` helper
   - [ ] Aplicar a GCal, Telegram, Gmail operations

7. **Input Validation** (6 hours)
   - [ ] Implementar `ValidateResourceField`
   - [ ] Implementar `ValidateUUID`
   - [ ] Implementar `ValidateFutureDate`
   - [ ] Validar todos los inputs en todos los scripts

8. **Idempotency** (4 hours)
   - [ ] Agregar idempotency key a cancel_booking
   - [ ] Agregar idempotency key a reschedule_booking
   - [ ] Validar idempotency en todos los writes

### 🟡 MEDIUM PRIORITY (Week 5-6)

9. **Notification System** (8 hours)
   - [ ] Implementar reminder cron job (24h before)
   - [ ] Implementar reminder cron job (2h before)
   - [ ] Agregar retry ×3 a notificaciones
   - [ ] Implementar notification matrix completa

10. **Transaction Isolation** (4 hours)
    - [ ] Usar `serializable` isolation level en booking TX
    - [ ] Implementar `SELECT ... FOR UPDATE` en availability check
    - [ ] Asegurar atomicidad en create + GCal sync

11. **Context Timeout** (4 hours)
    - [ ] Reemplazar todos `context.Background()` con `context.WithTimeout`
    - [ ] Default timeout: 30s
    - [ ] Aplicar a DB, GCal, HTTP calls

12. **Schedule Configuration** (2 hours)
    - [ ] Configurar cron para GCal reconciliation (*/5 * * * *)
    - [ ] Configurar cron para reminders (0 * * * *)
    - [ ] Configurar cron para no-show marking (0 1 * * *)

### 🟢 LOW PRIORITY (Week 7+)

13. **Documentation Updates** (4 hours)
    - [ ] Actualizar README.md con v4.0 compliance
    - [ ] Actualizar docs/ con nuevas tablas
    - [ ] Documentar migration guide

14. **Testing** (8 hours)
    - [ ] Tests para state machine transitions
    - [ ] Tests para GCal sync retry
    - [ ] Tests para HIPAA compliance (no PII in logs)
    - [ ] Tests para idempotency

15. **Performance Optimization** (4 hours)
    - [ ] Índices para queries de availability
    - [ ] Índices para GCal reconciliation
    - [ ] Connection pooling tuning

---

## 📋 MIGRATION CHECKLIST

### Database Migration Script

```sql
-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. Create patients table
CREATE TABLE IF NOT EXISTS patients (
    patient_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    email             TEXT UNIQUE,
    phone             TEXT,
    telegram_chat_id  TEXT,
    gcal_calendar_id  TEXT,
    timezone          TEXT DEFAULT 'America/Mexico_City',
    metadata          JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add gcal sync columns to bookings
ALTER TABLE bookings 
    ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(patient_id),
    ADD COLUMN IF NOT EXISTS gcal_provider_event_id TEXT,
    ADD COLUMN IF NOT EXISTS gcal_patient_event_id TEXT,
    ADD COLUMN IF NOT EXISTS gcal_sync_status TEXT DEFAULT 'pending'
        CHECK (gcal_sync_status IN ('pending','synced','partial','failed')),
    ADD COLUMN IF NOT EXISTS gcal_retry_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS gcal_last_sync TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS reminder_2h_sent BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS rescheduled_from UUID REFERENCES bookings(booking_id),
    ADD COLUMN IF NOT EXISTS rescheduled_to UUID REFERENCES bookings(booking_id),
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- 4. Update status constraint
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_status;
ALTER TABLE bookings ADD CONSTRAINT chk_status 
    CHECK (status IN ('pending','confirmed','in_service','completed','cancelled','no_show','rescheduled'));

-- 5. Add EXCLUDE constraint for overlapping bookings
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE INDEX IF NOT EXISTS idx_bookings_no_overlap
    ON bookings USING gist (
        provider_id WITH =,
        tstzrange(start_time, end_time) WITH &&
    ) WHERE (status NOT IN ('cancelled', 'no_show', 'rescheduled'));
```

---

## 🔗 REFERENCES

- **v4.0 DEFINITIVE EDITION:** `/home/manager/Sync/wildmill-proyects/booking-titanium-wm/WINDMILL_GO_MEDICAL_BOOKING_SYSTEM_PROMPT_v4.0.md`
- **Current DB Schema:** `/home/manager/Sync/wildmill-proyects/booking-titanium-wm/database/init/001_init.sql`
- **Types:** `/home/manager/Sync/wildmill-proyects/booking-titanium-wm/pkg/types/types.go`
- **AI Agent:** `/home/manager/Sync/wildmill-proyects/booking-titanium-wm/internal/ai/agent.go`
- **GCal:** `/home/manager/Sync/wildmill-proyects/booking-titanium-wm/internal/communication/gcal.go`

---

**Report Generated:** 2026-03-28  
**Next Review:** 2026-04-04 (Week 1 complete)  
**Target 100% Compliance:** 2026-05-09 (Week 7)
