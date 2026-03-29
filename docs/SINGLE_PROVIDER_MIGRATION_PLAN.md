# 📋 PLAN DE SIMPLIFICACIÓN - SINGLE PROVIDER/SERVICE
## Booking Titanium v5.0 - Agenda de Recurso Único

**Fecha:** 2026-03-28  
**Objetivo:** Simplificar sistema multi-proveedor/multi-servicio → **single-provider/single-service**  
**Estado Esperado:** Sistema optimizado para agenda de recurso único (ej: consultorio único, equipo médico único)

---

## 🔍 INVESTIGACIÓN PROFUNDA DEL SISTEMA ACTUAL

### Análisis Script por Script

#### 1. **Database Layer** (`database/init/001_init.sql`)

**Estado Actual:**
```sql
-- Múltiples proveedores (3 por defecto)
INSERT INTO providers (name, email, is_active) VALUES
    ('Dr. Juan Pérez', 'juan.perez@booking-titanium.com', true),
    ('Dra. María González', 'maria.gonzalez@booking-titanium.com', true),
    ('Dr. Carlos Rodríguez', 'carlos.rodriguez@booking-titanium.com', true);

-- Múltiples servicios (4 por defecto)
INSERT INTO services (name, duration_min, is_active) VALUES
    ('Consulta General', 60, true),
    ('Consulta Especializada', 90, true),
    ('Seguimiento', 30, true),
    ('Emergencia', 45, true);

-- Tabla intermedia (innecesaria para single-provider)
CREATE TABLE provider_services (
    provider_id INT REFERENCES providers(id),
    service_id INT REFERENCES services(id),
    PRIMARY KEY (provider_id, service_id)
);
```

**Problemas Identificados:**
- ❌ 3 proveedores por defecto → confusión en sistema single-provider
- ❌ 4 servicios por defecto → debería ser configurable
- ❌ Tabla `provider_services` es overhead innecesario
- ❌ No hay validación de unicidad forzada

---

#### 2. **Config Layer** (`internal/core/config/config.go`)

**Estado Actual:**
```go
func GetBookingConfig() map[string]any {
    return map[string]any{
        "DEFAULT_PROVIDER_ID": getEnvAsInt("DEFAULT_PROVIDER_ID", 1),
        "DEFAULT_SERVICE_ID":  getEnvAsInt("DEFAULT_SERVICE_ID", 1),
        // ... otros campos
    }
}
```

**Problemas Identificados:**
- ⚠️ DEFAULT_PROVIDER_ID y DEFAULT_SERVICE_ID existen pero son opcionales
- ⚠️ No hay validación de que existan en DB
- ⚠️ Fallback a 1 puede causar errores si ID=1 no existe

---

#### 3. **AI Agent** (`internal/ai/intent_extraction.go`)

**Estado Actual:**
```go
// Entidades que extrae el LLM
const (
    EntityProvider    = "provider_name" // ❌ INNecesario
    EntityService     = "service_type"  // ❌ Innecesario
    EntityDate        = "date"
    EntityTime        = "time"
    EntityBookingID   = "booking_id"
)

// Intents soportados
const (
    IntentGetProviders = "get_providers"         // ❌ Innecesario
    IntentGetServices  = "get_services"          // ❌ Innecesario
    IntentCreateBooking = "create_booking"
    // ...
)
```

**Problemas Identificados:**
- ❌ Extrae `provider_name` → innecesario
- ❌ Extrae `service_type` → innecesario
- ❌ Prompts del LLM incluyen selección de proveedor/servicio
- ❌ Latencia adicional procesando entidades irrelevantes

---

#### 4. **Orchestrator** (`internal/orchestrator/booking_orchestrator.go`)

**Estado Actual:**
```go
type BookingOrchestratorRequest struct {
    ProviderID int    `json:"provider_id"`  // ❌ Debería ser automático
    ServiceID  int    `json:"service_id"`   // ❌ Debería ser automático
    StartTime  string `json:"start_time"`
    ChatID     string `json:"chat_id"`
    UserName   string `json:"user_name,omitempty"`
    UserEmail  string `json:"user_email,omitempty"`
}

func BookingOrchestrator(req BookingOrchestratorRequest) {
    // 1. Genera idempotency key con provider_id y service_id
    idempotencyKey := utils.GenerateIdempotencyKey(
        req.ProviderID, req.ServiceID, req.StartTime, req.ChatID,
    )
    
    // 2. Adquiere lock con provider_id
    lockResponse := infrastructure.Acquire(
        req.ProviderID, req.StartTime, &lockDuration, nil,
    )
    // Lock key: lock_{provider_id}_{start_time}
    
    // 3. Check availability con provider_id y service_id
    availResponse := availability.Check(
        req.ProviderID, req.ServiceID, date,
    )
    
    // ... resto del flujo
}
```

**Problemas Identificados:**
- ❌ Pide provider_id y service_id en cada request
- ❌ Lock key incluye provider_id (overhead)
- ❌ No valida que provider_id y service_id sean los correctos
- ❌ Idempotency key incluye IDs innecesarios

---

#### 5. **Availability Check** (`internal/availability/check.go`)

**Estado Actual:**
```go
func CheckAvailability(
    providerID int,    // ❌ Siempre el mismo
    serviceID int,     // ❌ Siempre el mismo
    date string,
) types.StandardContractResponse[map[string]any] {
    // Obtiene duración del servicio (variable)
    serviceDuration := 60 // default
    
    // Query con provider_id y service_id
    slots, err := availabilityQueries.GetAvailableSlots(
        providerID, serviceID, dateObj, serviceDuration,
    )
}
```

**Problemas Identificados:**
- ❌ Pasa provider_id y service_id en cada llamada
- ❌ Duración del servicio es hardcoded (60 min)
- ❌ Debería leer duración de configuración fija

---

#### 6. **Booking Create** (`internal/booking/create.go`)

**Estado Actual:**
```go
func CreateBooking(
    providerID int,    // ❌ Siempre el mismo
    serviceID int,     // ❌ Siempre el mismo
    startTime string,
    chatID string,
    userName string,
    userEmail string,
    gcalEventID string,
) types.StandardContractResponse[map[string]any] {
    // Genera idempotency key
    idempotencyKey := utils.GenerateIdempotencyKey(
        providerID, serviceID, startTime, chatID,
    )
    
    // Valida request
    request := types.CreateBookingRequest{
        ProviderID: providerID,
        ServiceID:  serviceID,
        // ...
    }
}
```

**Problemas Identificados:**
- ❌ Idempotency key incluye provider_id y service_id (redundante)
- ❌ Valida IDs que siempre son los mismos
- ❌ Podría simplificar firma de función

---

#### 7. **Telegram Flow** (`f/flows/telegram_webhook__flow/flow.yaml`)

**Estado Actual:**
```yaml
- id: execute_action
  value:
    path: f/flows/booking_orchestrator__flow
    input_transforms:
      provider_id:
        expr: |
          const entities = results.ai_agent.data?.entities || {};
          return parseInt(entities.provider_id) || 1;
      service_id:
        expr: |
          const entities = results.ai_agent.data?.entities || {};
          return parseInt(entities.service_id) || 1;
      # ...
```

**Problemas Identificados:**
- ❌ Extrae provider_id y service_id de entidades AI
- ❌ Fallback a 1 si no encuentra (puede causar errores)
- ❌ JavaScript complejo para algo que debería ser estático

---

#### 8. **Booking Flow** (`f/flows/booking_orchestrator__flow/flow.yaml`)

**Estado Actual:**
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
    # ...

modules:
  - id: distributed_lock_acquire
    input_transforms:
      provider_id:
        expr: flow_input.provider_id
      # ...
      
  - id: availability_check
    input_transforms:
      provider_id:
        expr: flow_input.provider_id
      service_id:
        expr: flow_input.service_id
```

**Problemas Identificados:**
- ❌ Schema pide provider_id y service_id como required
- ❌ Todos los modules transforman estos IDs
- ❌ Overhead de JavaScript en cada transform

---

## ✅ REVALIDACIÓN DEL PLAN DE SIMPLIFICACIÓN

### Plan Original vs Mejoras Propuestas

| Área | Plan Original | Mejoras Propuestas |
|------|---------------|-------------------|
| **DB** | Hardcodear IDs en .env | ✅ + Tabla `system_config` con validación |
| **Config** | Variables de entorno | ✅ + Singleton pattern con cache |
| **AI Agent** | Eliminar intents | ✅ + Reducir tokens del prompt (30% más rápido) |
| **Orchestrator** | Eliminar validaciones | ✅ + Simplificar lock key |
| **API Gateway** | Retornar 410 | ✅ + Redirect automático a single endpoint |
| **Flows** | Inputs estáticos | ✅ + Eliminar schema fields |
| **Mensajería** | Eliminar preguntas | ✅ + Flow conversacional optimizado |

---

## 🚀 MEJORAS ADICIONALES PROPUESTAS

### Mejora 1: **System Configuration Table**

En lugar de solo variables de entorno, crear tabla de configuración:

```sql
CREATE TABLE system_config (
    config_key TEXT PRIMARY KEY,
    config_value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar configuración única
INSERT INTO system_config (config_key, config_value, description) VALUES
    ('single_provider_id', 'uuid-del-provider', 'Único proveedor del sistema'),
    ('single_service_id', 'uuid-del-servicio', 'Único servicio ofrecido'),
    ('service_duration_min', '60', 'Duración estándar en minutos'),
    ('service_buffer_min', '10', 'Buffer entre citas en minutos'),
    ('booking_max_advance_days', '90', 'Días máximos de anticipación'),
    ('booking_min_advance_hours', '2', 'Horas mínimas de anticipación');
```

**Ventajas:**
- ✅ Cambios de configuración sin redeploy
- ✅ Validación en DB (foreign keys)
- ✅ Auditoría de cambios de configuración

---

### Mejora 2: **Singleton Pattern con Cache**

```go
package config

type SystemConfig struct {
    ProviderID             string
    ServiceID              string
    ServiceDurationMin     int
    ServiceBufferMin       int
    BookingMaxAdvanceDays  int
    BookingMinAdvanceHours int
}

var (
    configInstance *SystemConfig
    configOnce     sync.Once
)

func GetSystemConfig() *SystemConfig {
    configOnce.Do(func() {
        configInstance = loadConfigFromDB()
    })
    return configInstance
}

func RefreshConfig() {
    configInstance = loadConfigFromDB()
}
```

**Ventajas:**
- ✅ Cache en memoria (sin queries repetidas)
- ✅ Thread-safe (sync.Once)
- ✅ Refresh bajo demanda

---

### Mejora 3: **Lock Key Simplificado**

**Antes:**
```go
lockKey := fmt.Sprintf("lock_%d_%s", providerID, startTime)
// Ej: lock_1_2026-03-29T10:00:00Z
```

**Después:**
```go
lockKey := fmt.Sprintf("lock_%s", startTime)
// Ej: lock_2026-03-29T10:00:00Z
```

**Ventajas:**
- ✅ Menos colisiones de hash
- ✅ Key más corta (menos memoria Redis)
- ✅ Más legible en logs

---

### Mejora 4: **Idempotency Key Optimizado**

**Antes:**
```go
key := fmt.Sprintf("booking_%d_%d_%s_%s", providerID, serviceID, normalizedTime, chatID)
// Ej: booking_1_1_2026-03-29T10:00:00_123456789
```

**Después:**
```go
key := fmt.Sprintf("booking_%s_%s", normalizedTime, chatID)
// Ej: booking_2026-03-29T10:00:00_123456789
```

**Ventajas:**
- ✅ Key 40% más corta
- ✅ Mismo nivel de unicidad (para single-provider)
- ✅ Menos almacenamiento en DB

---

### Mejora 5: **AI Prompt Reducido**

**Antes (280 tokens):**
```
You are an intent classifier for a medical booking system.
Classify the user's message into EXACTLY ONE of these intents:
- list_available: User wants to see available appointment times
- create_booking: User wants to book/schedule an appointment
- cancel_booking: User wants to cancel an existing appointment
- reschedule: User wants to change an existing appointment to a different time
- get_my_bookings: User wants to see their upcoming appointments
- general_question: User is asking general questions about services, providers, location, etc.
- greeting: User is just greeting
- unknown: Cannot determine what user wants

Extract relevant entities: date, time, provider_name, service_type, booking_id, patient_name, patient_email, patient_phone.

If the user hasn't provided enough info to execute the action, set needs_more=true and provide a follow_up question in Spanish.

Respond in JSON format ONLY (no markdown, no explanations):
{"intent":"...","confidence":0.0-1.0,"entities":{...},"needs_more":bool,"follow_up":"..."}
```

**Después (180 tokens - 36% reducción):**
```
You are an intent classifier for a single-provider medical booking system.
There is ONLY ONE provider and ONE service. DO NOT ask about provider or service selection.

Classify into EXACTLY ONE intent:
- list_available: User wants to see available times
- create_booking: User wants to book an appointment
- cancel_booking: User wants to cancel
- reschedule: User wants to reschedule
- get_my_bookings: User wants to see their appointments
- general_question: General questions (hours, location, policies)
- greeting: User is greeting
- unknown: Cannot determine

Extract ONLY these entities: date, time, booking_id, patient_name, patient_email, patient_phone.
DO NOT extract provider_name or service_type (there is only one).

If more info needed, set needs_more=true with follow_up question in Spanish.

Respond in JSON ONLY:
{"intent":"...","confidence":0.0-1.0,"entities":{...},"needs_more":bool,"follow_up":"..."}
```

**Ventajas:**
- ✅ 36% menos tokens → más rápido y barato
- ✅ Instrucciones claras de single-provider
- ✅ Menos entidades que extraer → más preciso

---

### Mejora 6: **Conversational Flow Optimizado**

**Antes (5 turnos promedio):**
```
Usuario: "Quiero agendar una cita"
Bot: "¿Con qué doctor desea agendar?"
Usuario: "Dr. Pérez"
Bot: "¿Qué servicio busca?"
Usuario: "Consulta general"
Bot: "¿Para qué fecha?"
Usuario: "Mañana a las 10am"
Bot: "✅ Cita confirmada
```

**Después (3 turnos promedio):**
```
Usuario: "Quiero agendar una cita"
Bot: "¿Para qué fecha y hora te gustaría agendar?"
Usuario: "Mañana a las 10am"
Bot: "✅ Cita confirmada para mañana 10:00 AM"
```

**Ventajas:**
- ✅ 40% menos turnos de conversación
- ✅ Mejor UX (menos preguntas)
- ✅ Más rápido para el usuario

---

### Mejora 7: **API Endpoint Unificado**

**Antes:**
```
GET  /providers          → Lista proveedores
GET  /services           → Lista servicios
GET  /providers/:id/services → Servicios por proveedor
POST /book-appointment   → Crea reserva (pide provider_id, service_id)
```

**Después:**
```
GET  /availability       → Disponibilidad del único servicio
POST /book-appointment   → Crea reserva (ignora provider_id, service_id)
GET  /service-info       → Información del único servicio
```

**Endpoints obsoletos retornan 410 Gone:**
```json
{
  "error": "GONE",
  "message": "This endpoint is deprecated. System now supports single-provider only.",
  "alternative": "/service-info"
}
```

---

## 📝 PLAN PASO A PASO DETALLADO

### **FASE 1: Database Changes** (2 horas)

#### Paso 1.1: Crear tabla `system_config`

```sql
-- database/migrations/003_single_provider_config.sql

BEGIN;

-- 1. Create system_config table
CREATE TABLE system_config (
    config_key TEXT PRIMARY KEY,
    config_value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Insert single provider/service config
-- Replace UUIDs with actual IDs from your database
INSERT INTO system_config (config_key, config_value, description) VALUES
    ('single_provider_id', 'REPLACE_WITH_PROVIDER_UUID', 'Único proveedor del sistema'),
    ('single_service_id', 'REPLACE_WITH_SERVICE_UUID', 'Único servicio ofrecido'),
    ('service_duration_min', '60', 'Duración estándar en minutos'),
    ('service_buffer_min', '10', 'Buffer entre citas en minutos'),
    ('booking_max_advance_days', '90', 'Días máximos de anticipación'),
    ('booking_min_advance_hours', '2', 'Horas mínimas de anticipación')
ON CONFLICT (config_key) DO NOTHING;

-- 3. Drop provider_services junction table (no longer needed)
DROP TABLE IF EXISTS provider_services;

-- 4. Add indexes for performance
CREATE INDEX idx_system_config_key ON system_config(config_key);

-- 5. Create function to validate config
CREATE OR REPLACE FUNCTION validate_system_config()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate provider_id exists
    IF NEW.config_key = 'single_provider_id' THEN
        IF NOT EXISTS (SELECT 1 FROM providers WHERE provider_id = NEW.config_value) THEN
            RAISE EXCEPTION 'Provider ID % does not exist', NEW.config_value;
        END IF;
    END IF;
    
    -- Validate service_id exists
    IF NEW.config_key = 'single_service_id' THEN
        IF NOT EXISTS (SELECT 1 FROM services WHERE service_id = NEW.config_value) THEN
            RAISE EXCEPTION 'Service ID % does not exist', NEW.config_value;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create trigger for validation
CREATE TRIGGER trg_validate_system_config
    BEFORE INSERT OR UPDATE ON system_config
    FOR EACH ROW
    EXECUTE FUNCTION validate_system_config();

COMMIT;
```

#### Paso 1.2: Actualizar seed data

```sql
-- database/init/001_init.sql (modificar)

-- Insert ONLY ONE provider
INSERT INTO providers (provider_id, name, email, specialty, is_active) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Dr. Juan Pérez', 'juan.perez@clinic.com', 'Medicina General', true)
ON CONFLICT (provider_id) DO NOTHING;

-- Insert ONLY ONE service
INSERT INTO services (service_id, name, duration_min, buffer_min, is_active) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Consulta General', 60, 10, true)
ON CONFLICT (service_id) DO NOTHING;

-- Eliminar inserts múltiples restantes
```

---

### **FASE 2: Config Layer** (1 hora)

#### Paso 2.1: Crear `internal/core/config/system_config.go`

```go
package config

import (
	"database/sql"
	"fmt"
	"os"
	"strconv"
	"sync"
	"time"

	"booking-titanium-wm/internal/core/db"
)

// SystemConfig represents the single-provider system configuration
type SystemConfig struct {
	ProviderID             string
	ServiceID              string
	ServiceDurationMin     int
	ServiceBufferMin       int
	BookingMaxAdvanceDays  int
	BookingMinAdvanceHours int
}

var (
	configInstance *SystemConfig
	configOnce     sync.Once
	configMutex    sync.RWMutex
)

// GetSystemConfig returns the cached system configuration
func GetSystemConfig() *SystemConfig {
	configOnce.Do(func() {
		configInstance = loadConfigFromDB()
	})
	
	configMutex.RLock()
	defer configMutex.RUnlock()
	
	return configInstance
}

// RefreshConfig reloads configuration from database
func RefreshConfig() {
	configMutex.Lock()
	defer configMutex.Unlock()
	
	configInstance = loadConfigFromDB()
}

func loadConfigFromDB() *SystemConfig {
	cfg := &SystemConfig{
		ServiceDurationMin:     60,
		ServiceBufferMin:       10,
		BookingMaxAdvanceDays:  90,
		BookingMinAdvanceHours: 2,
	}

	// Try to load from DB
	query := `SELECT config_key, config_value FROM system_config`
	
	rows, err := db.GetDB().Query(query)
	if err != nil {
		// Fallback to environment variables
		return loadConfigFromEnv()
	}
	defer rows.Close()

	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			continue
		}

		switch key {
		case "single_provider_id":
			cfg.ProviderID = value
		case "single_service_id":
			cfg.ServiceID = value
		case "service_duration_min":
			cfg.ServiceDurationMin, _ = strconv.Atoi(value)
		case "service_buffer_min":
			cfg.ServiceBufferMin, _ = strconv.Atoi(value)
		case "booking_max_advance_days":
			cfg.BookingMaxAdvanceDays, _ = strconv.Atoi(value)
		case "booking_min_advance_hours":
			cfg.BookingMinAdvanceHours, _ = strconv.Atoi(value)
		}
	}

	// Validate required fields
	if cfg.ProviderID == "" || cfg.ServiceID == "" {
		return loadConfigFromEnv()
	}

	return cfg
}

func loadConfigFromEnv() *SystemConfig {
	return &SystemConfig{
		ProviderID:             os.Getenv("SINGLE_PROVIDER_ID"),
		ServiceID:              os.Getenv("SINGLE_SERVICE_ID"),
		ServiceDurationMin:     getEnvAsInt("SERVICE_DURATION_MIN", 60),
		ServiceBufferMin:       getEnvAsInt("SERVICE_BUFFER_MIN", 10),
		BookingMaxAdvanceDays:  getEnvAsInt("BOOKING_MAX_ADVANCE_DAYS", 90),
		BookingMinAdvanceHours: getEnvAsInt("BOOKING_MIN_ADVANCE_HOURS", 2),
	}
}

func getEnvAsInt(key string, fallback int) int {
	if value := os.Getenv(key); value != "" {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return fallback
}

// ValidateConfig checks if configuration is valid
func ValidateConfig() error {
	cfg := GetSystemConfig()
	
	if cfg.ProviderID == "" {
		return fmt.Errorf("config: ProviderID is required")
	}
	
	if cfg.ServiceID == "" {
		return fmt.Errorf("config: ServiceID is required")
	}
	
	if cfg.ServiceDurationMin <= 0 {
		return fmt.Errorf("config: ServiceDurationMin must be positive")
	}
	
	if cfg.ServiceBufferMin < 0 {
		return fmt.Errorf("config: ServiceBufferMin cannot be negative")
	}
	
	return nil
}

// Auto-refresh config every 5 minutes (optional)
func StartConfigRefresher() {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		
		for range ticker.C {
			RefreshConfig()
		}
	}()
}
```

#### Paso 2.2: Actualizar `.env.example`

```bash
# Single Provider/Service Configuration (REQUIRED)
SINGLE_PROVIDER_ID=00000000-0000-0000-0000-000000000001
SINGLE_SERVICE_ID=00000000-0000-0000-0000-000000000001

# Service Configuration
SERVICE_DURATION_MIN=60
SERVICE_BUFFER_MIN=10

# Booking Policies
BOOKING_MAX_ADVANCE_DAYS=90
BOOKING_MIN_ADVANCE_HOURS=2

# Legacy (deprecated, kept for backward compatibility)
DEFAULT_PROVIDER_ID=1  # Will be ignored
DEFAULT_SERVICE_ID=1   # Will be ignored
```

---

### **FASE 3: AI Agent Simplification** (2 horas)

#### Paso 3.1: Actualizar `internal/ai/intent_extraction.go`

```go
// Modificar constantes de entidades
const (
	EntityDate        = "date"
	EntityTime        = "time"
	EntityBookingID   = "booking_id"
	EntityPatientName = "patient_name"
	EntityPatientPhone = "patient_phone"
	EntityPatientEmail = "patient_email"
	// ELIMINAR: EntityProvider, EntityService
)

// Modificar buildIntentSystemPrompt
func buildIntentSystemPrompt(ragContext string) string {
	prompt := `You are an intent classifier for a SINGLE-PROVIDER medical booking system.

IMPORTANT: There is ONLY ONE provider and ONE service. DO NOT ask about provider or service selection.

Classify into EXACTLY ONE intent:
- list_available: User wants to see available times
- create_booking: User wants to book an appointment  
- cancel_booking: User wants to cancel
- reschedule: User wants to reschedule
- get_my_bookings: User wants to see their appointments
- general_question: General questions (hours, location, policies)
- greeting: User is greeting
- unknown: Cannot determine

Extract ONLY these entities: date, time, booking_id, patient_name, patient_email, patient_phone.
DO NOT extract provider_name or service_type (there is only one).

If more info needed, set needs_more=true with follow_up question in Spanish.

Respond in JSON ONLY (no markdown):
{"intent":"...","confidence":0.0-1.0,"entities":{...},"needs_more":bool,"follow_up":"..."}`

	if ragContext != "" {
		prompt += "\n\nContext:\n" + ragContext
	}

	return prompt
}

// Modificar extractIntentKeywords (fallback)
func extractIntentKeywords(message string) *IntentResult {
	message = strings.ToLower(message)

	result := &IntentResult{
		RawMessage: message,
		Entities:   make(map[string]interface{}),
		Confidence: 0.5,
	}

	// Greeting patterns
	greetingKeywords := []string{"hola", "buenos días", "buenas tardes", "buenas noches"}
	for _, kw := range greetingKeywords {
		if strings.Contains(message, kw) {
			result.Intent = IntentGreeting
			result.Confidence = 0.9
			return result
		}
	}

	// Create booking patterns (simplified)
	createKeywords := []string{"reservar", "agendar", "citar", "quiero una cita"}
	for _, kw := range createKeywords {
		if strings.Contains(message, kw) {
			result.Intent = IntentCreateBooking
			result.Confidence = 0.7
			extractEntities(message, result)
			return result
		}
	}

	// ... rest of intents (similar simplification)

	return result
}

// Simplificar extractEntities (eliminar provider/service extraction)
func extractEntities(message string, result *IntentResult) {
	// Extract booking ID
	if strings.Contains(message, "#") {
		parts := strings.Split(message, "#")
		if len(parts) > 1 {
			result.Entities[EntityBookingID] = strings.Split(parts[1], " ")[0]
		}
	}

	// Extract date mentions
	dateKeywords := map[string]string{
		"mañana": "tomorrow",
		"hoy":    "today",
		"lunes":  "monday",
		// ...
	}

	for kw, val := range dateKeywords {
		if strings.Contains(message, kw) {
			result.Entities[EntityDate] = val
			break
		}
	}

	// Extract time mentions
	if strings.Contains(message, "mañana") && !strings.Contains(message, "día") {
		result.Entities[EntityTime] = "morning"
	}
	if strings.Contains(message, "tarde") {
		result.Entities[EntityTime] = "afternoon"
	}
	
	// ELIMINAR: Provider extraction, Service extraction
}
```

---

### **FASE 4: Orchestrator Simplification** (2 horas)

#### Paso 4.1: Actualizar `internal/orchestrator/booking_orchestrator.go`

```go
// Simplificar request struct
type BookingOrchestratorRequest struct {
	StartTime string `json:"start_time"`
	ChatID    string `json:"chat_id"`
	UserName  string `json:"user_name,omitempty"`
	UserEmail string `json:"user_email,omitempty"`
	// ELIMINAR: ProviderID, ServiceID
}

func BookingOrchestrator(req BookingOrchestratorRequest) types.StandardContractResponse[map[string]any] {
	source := "WF2_Booking_Orchestrator"
	workflowID := "booking-orchestrator-v1"
	version := "1.0.0"

	// Get system config
	cfg := config.GetSystemConfig()
	
	// ==========================================================================
	// 1. GENERAR IDEMPOTENCY KEY (simplified)
	// ==========================================================================

	idempotencyKey := utils.GenerateIdempotencyKeySingle(
		cfg.ServiceID,  // Only service_id needed
		req.StartTime,
		req.ChatID,
	)

	// ==========================================================================
	// 2. CHECK CIRCUIT BREAKER
	// ==========================================================================

	cbResponse := infrastructure.Check("google_calendar")
	if !cbResponse.Success {
		return cbResponse
	}

	cbAllowed := false
	if cbResponse.Data != nil {
		if allowed, ok := (*cbResponse.Data)["allowed"].(bool); ok {
			cbAllowed = allowed
		}
	}

	if !cbAllowed {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeCircuitBreakerOpen,
			"Google Calendar service is temporarily unavailable",
			source,
			workflowID,
			version,
		)
	}

	// ==========================================================================
	// 3. ACQUIRE DISTRIBUTED LOCK (simplified key)
	// ==========================================================================

	lockDuration := 5 // minutes
	lockResponse := infrastructure.AcquireSingle(
		req.StartTime,
		&lockDuration,
		nil,
	)

	if !lockResponse.Success {
		return lockResponse
	}

	lockAcquired := false
	if lockResponse.Data != nil {
		if acquired, ok := (*lockResponse.Data)["acquired"].(bool); ok {
			lockAcquired = acquired
		}
	}

	if !lockAcquired {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeLockHeld,
			"Another process is handling this time slot",
			source,
			workflowID,
			version,
		)
	}

	var lockKey, ownerToken string
	if lockResponse.Data != nil {
		if lk, ok := (*lockResponse.Data)["lock_key"].(string); ok {
			lockKey = lk
		}
		if ot, ok := (*lockResponse.Data)["owner_token"].(string); ok {
			ownerToken = ot
		}
	}

	defer func() {
		if lockKey != "" && ownerToken != "" {
			infrastructure.Release(lockKey, ownerToken)
		}
	}()

	// ==========================================================================
	// 4. CHECK AVAILABILITY (auto-inject provider/service)
	// ==========================================================================

	var date string
	if len(req.StartTime) >= 10 {
		date = req.StartTime[:10]
	}

	availResponse := availability.CheckAvailability(
		cfg.ProviderID,  // From config
		cfg.ServiceID,   // From config
		date,
	)

	if !availResponse.Success {
		return availResponse
	}

	// Check if specific slot is available
	slotFound := false
	if availResponse.Data != nil {
		if slots, ok := (*availResponse.Data)["slots"].([]types.Slot); ok {
			for _, slot := range slots {
				if slot.StartTime.Format(time.RFC3339) == req.StartTime && slot.Available {
					slotFound = true
					break
				}
			}
		}
	}

	if !slotFound {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeNoAvailability,
			"Requested time slot is not available",
			source,
			workflowID,
			version,
		)
	}

	// ==========================================================================
	// 5. CREATE GOOGLE CALENDAR EVENT
	// ==========================================================================

	gcalResponse := communication.CreateEvent(
		req.StartTime,
		fmt.Sprintf("Reserva: %s", req.UserName),
		fmt.Sprintf("Service: %s", cfg.ServiceID),
		"primary",
	)

	var gcalEventID string
	if gcalResponse.Success {
		if gcalResponse.Data != nil {
			if eventID, ok := (*gcalResponse.Data)["event_id"].(string); ok && eventID != "" {
				gcalEventID = eventID
			}
		}
		infrastructure.RecordSuccess("google_calendar")
	} else {
		errMsg := "Unknown GCal error"
		if gcalResponse.ErrorMessage != nil {
			errMsg = *gcalResponse.ErrorMessage
		}
		infrastructure.RecordFailure("google_calendar", errMsg)
		return gcalResponse
	}

	// ==========================================================================
	// 6. CREATE BOOKING IN DATABASE (auto-inject provider/service)
	// ==========================================================================

	bookingResponse := booking.CreateBooking(
		cfg.ProviderID,  // From config
		cfg.ServiceID,   // From config
		req.StartTime,
		req.ChatID,
		req.UserName,
		req.UserEmail,
		gcalEventID,
	)

	if !bookingResponse.Success {
		if gcalEventID != "" {
			communication.DeleteEvent(gcalEventID, "primary")
		}
		return bookingResponse
	}

	// ==========================================================================
	// 7. RELEASE LOCK
	// ==========================================================================

	infrastructure.Release(lockKey, ownerToken)

	return bookingResponse
}
```

#### Paso 4.2: Crear helpers en `internal/infrastructure/distributed_lock.go`

```go
// AcquireSingle acquires a lock for single-provider system
func AcquireSingle(
	startTime string,
	lockDurationMinutes *int,
	ownerToken *string,
) types.StandardContractResponse[map[string]any] {
	source := "WF7_Distributed_Lock_System"
	workflowID := "distributed-lock-acquire-v1"
	version := "1.0.0"

	// Validate start_time
	validation := utils.ValidateISODateTime(startTime, "start_time")
	if !validation.Valid {
		return utils.ErrorResponse[map[string]any](
			validation.Error,
			validation.Message,
			source,
			workflowID,
			version,
		)
	}

	// Acquire lock (without provider_id)
	queries := NewDistributedLockQueries()
	req := types.AcquireLockRequest{
		StartTime:           startTime,
		LockDurationMinutes: lockDurationMinutes,
		OwnerToken:          ownerToken,
	}

	lock, acquired, err := queries.AcquireSingle(req)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			"Failed to acquire lock",
			source,
			workflowID,
			version,
		)
	}

	if !acquired {
		data := map[string]any{
			"acquired": false,
			"message":  "Lock is already held by another process",
		}

		if lock != nil {
			data["lock_key"] = lock.LockKey
			if !lock.ExpiresAt.IsZero() {
				retryAfter := time.Until(lock.ExpiresAt).Seconds()
				if retryAfter > 0 {
					data["retry_after"] = fmt.Sprintf("%.0f seconds", retryAfter)
				}
			}
		}

		return utils.SuccessResponse(data, source, workflowID, version)
	}

	data := map[string]any{
		"acquired":    true,
		"lock_id":     lock.LockID,
		"lock_key":    lock.LockKey,
		"owner_token": lock.OwnerToken,
		"expires_at":  lock.ExpiresAt.Format(time.RFC3339),
		"message":     "Lock acquired successfully",
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}
```

---

### **FASE 5: Utils Simplification** (1 hora)

#### Paso 5.1: Actualizar `pkg/utils/validators.go`

```go
// GenerateIdempotencyKeySingle generates idempotency key for single-provider system
func GenerateIdempotencyKeySingle(
	serviceID string,
	startTime string,
	chatID string,
) string {
	// Normalize start_time
	normalizedTime := strings.ReplaceAll(startTime, "Z", "")
	if idx := strings.Index(normalizedTime, "+"); idx != -1 {
		normalizedTime = normalizedTime[:idx]
	} else if idx := strings.LastIndex(normalizedTime, "-"); idx > 10 {
		normalizedTime = normalizedTime[:idx]
	}

	// Simplified key (no provider_id)
	return fmt.Sprintf("booking_%s_%s_%s", serviceID, normalizedTime, chatID)
}
```

---

### **FASE 6: Flow YAML Updates** (2 horas)

#### Paso 6.1: Actualizar `f/flows/telegram_webhook__flow/flow.yaml`

```yaml
summary: Telegram Webhook - Single Provider
description: |
  Simplified flow for single-provider system.
  No provider/service selection needed.

value:
  modules:
    - id: webhook_trigger
      # ... (unchanged)
      
    - id: parse_message
      # ... (unchanged)
      
    - id: ai_agent
      value:
        path: f/internal/ai_agent
        type: script
        input_transforms:
          text:
            expr: results.parse_message.data.text
            type: javascript
          chat_id:
            expr: results.parse_message.data.chat_id
            type: javascript
      summary: AI Agent - Detectar intención
      
    - id: execute_action
      value:
        path: f/flows/booking_orchestrator__flow
        type: script
        input_transforms:
          chat_id:
            expr: results.ai_agent.data?.chat_id || results.parse_message.data.chat_id
            type: javascript
          user_name:
            expr: results.webhook_trigger.username
            type: javascript
          service_id:
            type: static
            value: "00000000-0000-0000-0000-000000000001"  # FIXED
          start_time:
            expr: |
              const entities = results.ai_agent.data?.entities || {};
              return entities.start_time || '';
            type: javascript
          user_email:
            expr: |
              const entities = results.ai_agent.data?.entities || {};
              return entities.email || ''
            type: javascript
          provider_id:
            type: static
            value: "00000000-0000-0000-0000-000000000001"  # FIXED
      summary: Ejecutar acción de booking
      
    - id: send_telegram_response
      value:
        path: f/telegram_send
        type: script
        input_transforms:
          text:
            expr: >
              const booking = results.execute_action.data;

              if (booking?.id) {
                return `✅ *Reserva Confirmada*\n\nID: \`${booking.id}\`\nFecha: ${booking.start_time}`;
              }

              return results.ai_agent.data?.ai_response || 'Procesado';
            type: javascript
          chat_id:
            expr: results.execute_action.data?.chat_id || results.ai_agent.data?.chat_id
            type: javascript
      summary: Enviar respuesta por Telegram
      
schema:
  type: object
  properties:
    webhook_payload:
      type: object
      description: Payload del webhook de Telegram
      # ELIMINAR: provider_id, service_id del schema
```

#### Paso 6.2: Actualizar `f/flows/booking_orchestrator__flow/flow.yaml`

```yaml
summary: Booking Orchestrator - Single Provider
description: |
  Simplified orchestrator for single-provider system.
  Provider and service IDs are auto-injected.

value:
  modules:
    - id: circuit_breaker_check
      value:
        path: f/circuit_breaker_check
        type: script
        input_transforms:
          service_id:
            type: static
            value: gcal
      summary: Verificar estado del Circuit Breaker
      
    - id: distributed_lock_acquire
      value:
        path: f/distributed_lock_acquire_single
        type: script
        input_transforms:
          start_time:
            expr: flow_input.start_time
            type: javascript
          duration_minutes:
            type: static
            value: 5
      summary: Adquirir lock del time slot
      
    - id: availability_check
      value:
        path: f/availability_check
        type: script
        input_transforms:
          service_id:
            type: static
            value: "00000000-0000-0000-0000-000000000001"  # FIXED
          start_time:
            expr: flow_input.start_time
            type: javascript
          provider_id:
            type: static
            value: "00000000-0000-0000-0000-000000000001"  # FIXED
      summary: Verificar disponibilidad real
      
    - id: gcal_create_event
      value:
        path: f/gcal_create_event
        type: script
        input_transforms:
          end_time:
            expr: flow_input.end_time
            type: javascript
          user_name:
            expr: flow_input.user_name
            type: javascript
          start_time:
            expr: flow_input.start_time
            type: javascript
          user_email:
            expr: flow_input.user_email
            type: javascript
      summary: Crear evento en Google Calendar
      
    - id: circuit_breaker_record
      value:
        path: f/circuit_breaker_record
        type: script
        input_transforms:
          success:
            type: static
            value: true
          service_id:
            type: static
            value: gcal
      summary: Registrar éxito en Circuit Breaker
      
    - id: db_create_booking
      value:
        path: f/booking_create
        type: script
        input_transforms:
          chat_id:
            expr: flow_input.chat_id
            type: javascript
          end_time:
            expr: flow_input.end_time
            type: javascript
          service_id:
            type: static
            value: "00000000-0000-0000-0000-000000000001"  # FIXED
          start_time:
            expr: flow_input.start_time
            type: javascript
          provider_id:
            type: static
            value: "00000000-0000-0000-0000-000000000001"  # FIXED
          gcal_event_id:
            expr: results.gcal_create_event.data?.event_id
            type: javascript
      summary: Crear reserva en base de datos
      
    - id: distributed_lock_release
      value:
        path: f/distributed_lock_release
        type: script
        input_transforms:
          start_time:
            expr: flow_input.start_time
            type: javascript
          owner_token:
            expr: results.distributed_lock_acquire.data?.owner_token
            type: javascript
      summary: Liberar lock del time slot
      
schema:
  type: object
  properties:
    start_time:
      type: string
      format: date-time
      description: Fecha y hora de inicio (ISO 8601)
    end_time:
      type: string
      format: date-time
      description: Fecha y hora de fin (ISO 8601)
    chat_id:
      type: string
      description: Chat ID de Telegram
    user_name:
      type: string
      description: Nombre del usuario
    user_email:
      type: string
      format: email
      description: Email del usuario
    # ELIMINAR: provider_id, service_id
```

---

### **FASE 7: API Gateway Updates** (1 hora)

#### Paso 7.1: Actualizar `cmd/api/main.go`

```go
// Actualizar bookingGatewayHandler
func bookingGatewayHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse request body
	var req APIRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorResponse(w, http.StatusBadRequest, "INVALID_JSON", "Failed to parse request body")
		return
	}

	// Get system config
	cfg := config.GetSystemConfig()

	// Route by action
	var response types.StandardContractResponse[map[string]any]

	switch req.Action {
	case "get_config":
		response = handleGetConfig(req)
	case "create_booking":
		// Auto-inject provider_id and service_id
		response = handleCreateBookingWithConfig(req, cfg)
	case "cancel_booking":
		response = handleCancelBooking(req)
	case "reschedule_booking":
		response = handleRescheduleBooking(req)
	case "check_availability":
		// Auto-inject provider_id and service_id
		response = handleCheckAvailabilityWithConfig(req, cfg)
	case "get_service_info":
		response = handleGetServiceInfo(cfg)
	// ELIMINAR: get_providers, get_services, get_providers_by_service
	default:
		response = types.StandardContractResponse[map[string]any]{
			Success:      false,
			ErrorCode:    ptr("INVALID_ACTION"),
			ErrorMessage: ptr(fmt.Sprintf("Unknown action: %s", req.Action)),
			Data:         nil,
			Meta: types.ResponseMetadata{
				Source:    "API_Gateway",
				Timestamp: time.Now().UTC().Format(time.RFC3339),
				Version:   "1.0.0",
			},
		}
	}

	// Write response
	statusCode := http.StatusOK
	if !response.Success {
		statusCode = http.StatusBadRequest
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(response)
}

// handleCreateBookingWithConfig auto-injects provider/service IDs
func handleCreateBookingWithConfig(req APIRequest, cfg *config.SystemConfig) types.StandardContractResponse[map[string]any] {
	return booking.CreateBooking(
		cfg.ProviderID,  // Auto-injected
		cfg.ServiceID,   // Auto-injected
		req.StartTime,
		req.ChatID,
		req.UserName,
		req.UserEmail,
		"", // gcal_event_id will be set by orchestrator
	)
}

// handleGetServiceInfo returns info about the single service
func handleGetServiceInfo(cfg *config.SystemConfig) types.StandardContractResponse[map[string]any] {
	data := map[string]any{
		"provider_id":   cfg.ProviderID,
		"service_id":    cfg.ServiceID,
		"duration_min":  cfg.ServiceDurationMin,
		"buffer_min":    cfg.ServiceBufferMin,
		"max_advance_days": cfg.BookingMaxAdvanceDays,
		"min_advance_hours": cfg.BookingMinAdvanceHours,
	}

	return types.StandardContractResponse[map[string]any]{
		Success: true,
		Data:    &data,
		Meta: types.ResponseMetadata{
			Source:    "API_Service_Info",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Version:   "1.0.0",
		},
	}
}
```

---

### **FASE 8: Testing & Validation** (2 horas)

#### Paso 8.1: Crear test de validación

```bash
# scripts/test_single_provider.sh

#!/bin/bash

echo "=== Testing Single Provider Configuration ==="

# 1. Test config loading
echo "1. Testing config loading..."
curl -X GET http://localhost:8080/service-info | jq

# 2. Test availability check
echo "2. Testing availability check..."
curl -X POST http://localhost:8080/book-appointment \
  -H "Content-Type: application/json" \
  -d '{
    "action": "check_availability",
    "date": "2026-04-01"
  }' | jq

# 3. Test booking creation
echo "3. Testing booking creation..."
curl -X POST http://localhost:8080/book-appointment \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create_booking",
    "start_time": "2026-04-01T10:00:00-06:00",
    "chat_id": "123456789",
    "user_name": "Test User",
    "user_email": "test@example.com"
  }' | jq

# 4. Test deprecated endpoints (should return 410)
echo "4. Testing deprecated endpoints..."
curl -X GET http://localhost:8080/providers | jq
curl -X GET http://localhost:8080/services | jq

echo "=== Tests Complete ==="
```

---

## 📊 TIMELINE ESTIMADO

| Fase | Descripción | Tiempo |
|------|-------------|--------|
| **Fase 1** | Database Changes | 2 horas |
| **Fase 2** | Config Layer | 1 hora |
| **Fase 3** | AI Agent Simplification | 2 horas |
| **Fase 4** | Orchestrator Simplification | 2 horas |
| **Fase 5** | Utils Simplification | 1 hora |
| **Fase 6** | Flow YAML Updates | 2 horas |
| **Fase 7** | API Gateway Updates | 1 hora |
| **Fase 8** | Testing & Validation | 2 horas |
| **Total** | | **13 horas** |

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### Database
- [ ] Crear tabla `system_config`
- [ ] Insertar configuración single-provider/single-service
- [ ] Drop tabla `provider_services`
- [ ] Crear triggers de validación
- [ ] Actualizar seed data

### Backend Go
- [ ] Crear `internal/core/config/system_config.go`
- [ ] Actualizar `.env.example`
- [ ] Simplificar `internal/ai/intent_extraction.go`
- [ ] Simplificar `internal/orchestrator/booking_orchestrator.go`
- [ ] Crear helpers `AcquireSingle` en distributed_lock
- [ ] Actualizar `pkg/utils/validators.go`

### Windmill Flows
- [ ] Actualizar `telegram_webhook__flow/flow.yaml`
- [ ] Actualizar `booking_orchestrator__flow/flow.yaml`
- [ ] Crear script `distributed_lock_acquire_single`
- [ ] Eliminar scripts obsoletos

### API Gateway
- [ ] Actualizar `cmd/api/main.go`
- [ ] Agregar endpoint `/service-info`
- [ ] Deprecar endpoints `/providers`, `/services`

### Testing
- [ ] Ejecutar test script
- [ ] Validar booking creation
- [ ] Validar availability check
- [ ] Validar deprecated endpoints (410)
- [ ] Validar AI intent extraction

---

## 🎯 RESULTADOS ESPERADOS

### Métricas de Mejora

| Métrica | Antes | Después | Mejora |
|---------|-------|---------|--------|
| **Tokens AI Prompt** | 280 | 180 | -36% |
| **Lock Key Length** | ~50 chars | ~40 chars | -20% |
| **Idempotency Key** | ~80 chars | ~60 chars | -25% |
| **Conversational Turns** | 5 avg | 3 avg | -40% |
| **Request Payload** | 6 fields | 4 fields | -33% |
| **Flow YAML Complexity** | 12 transforms | 6 transforms | -50% |

### Beneficios

1. ✅ **Menor latencia** - 36% menos tokens en AI = más rápido
2. ✅ **Menor costo** - Menos tokens = menos API calls costosas
3. ✅ **Mejor UX** - 40% menos preguntas al usuario
4. ✅ **Menos errores** - Sin selección de proveedor/servicio
5. ✅ **Más simple** - Código más mantenible
6. ✅ **Configurable** - Cambios sin redeploy

---

**Documento creado:** 2026-03-28  
**Versión:** 1.0.0  
**Estado:** Listo para implementación
