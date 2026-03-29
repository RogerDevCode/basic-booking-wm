# 📘 Booking Titanium - Windmill (Go/Golang)

**Estado:** 🟢 98% Complete - Production Ready
**Versión:** 1.0.0
**Lenguaje:** Go 1.25+
**Basado en:** Workflows n8n NN_01, WF1, WF2

---

## 📋 Descripción

Sistema de reservas de citas implementado en **Go/Golang** para Windmill.
Incluye las operaciones core de creación, cancelación y reagendamiento de reservas.

### ✅ Features Completas

- **API HTTP** completa con endpoints de booking
- **Telegram Webhook** para recibir mensajes de usuarios
- **AI Agent** para detección de intenciones (create/cancel/reschedule)
- **17 Windmill Scripts** en Go (package inner, func main)
- **Circuit Breaker** para resiliencia
- **Distributed Lock** para prevenir double-booking
- **Google Calendar** integration
- **Telegram/Gmail** para notificaciones
- **45/47 tests** migrados (96%)

---

## 🏗️ Arquitectura

### Flujo Principal (API → Booking)

```
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (HTTP)                        │
│                   /book-appointment                          │
│                  (cmd/api/main.go)                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Booking Orchestrator                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Circuit    │→ │    Lock      │→ │ Availability │      │
│  │   Breaker    │  │   acquire    │  │    check     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                              │                               │
│                              ▼                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  GCal Create │→ │  DB Create   │→ │   Lock       │      │
│  │   Event      │  │   Booking    │  │   release    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Flujo Telegram Webhook (Nuevo ✨)

```
┌──────────────┐     ┌───────────────────┐     ┌─────────────────┐
│   Usuario    │────▶│  Telegram Bot     │────▶│  API Gateway    │
│  envía msg   │     │   (Cloudflare)    │     │ /api/telegram/  │
└──────────────┘     └───────────────────┘     │    webhook      │
                                               └────────┬────────┘
                                                        │
                        ┌───────────────────────────────┼──────────┐
                        │                               ▼          │
                        │                    ┌─────────────────┐  │
                        │                    │  Windmill Flow  │  │
                        │                    │ telegram-webhook│  │
                        │                    └────────┬────────┘  │
                        │                             │           │
                        │              ┌──────────────┼────────┐ │
                        │              │              │        │ │
                        ▼              ▼              ▼        ▼ ▼
              ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐
              │  AI Agent   │ │   Booking   │ │   Telegram      │
              │  (intent)   │ │ Orchestrator│ │   Send          │
              └─────────────┘ └─────────────┘ └─────────────────┘
```

---

## 📁 Estructura del Proyecto

```
booking-titanium-wm/
├── cmd/                           # Aplicaciones principales
│   ├── api/                       # API HTTP server
│   │   └── main.go                # ✅ +telegramWebhookHandler
│   └── workers/                   # Background workers
│       └── main.go
│
├── internal/                      # Código privado de la aplicación
│   ├── core/                      # Core utilities
│   │   ├── db.go                  # Database connection
│   │   └── config.go              # Configuration
│   │
│   ├── booking/                   # Booking operations
│   │   ├── create.go              # Create booking
│   │   ├── cancel.go              # Cancel booking
│   │   └── reschedule.go          # Reschedule booking
│   │
│   ├── availability/              # Availability operations
│   │   └── check.go               # Check availability
│   │
│   ├── infrastructure/            # Infrastructure
│   │   ├── circuit_breaker.go     # Circuit breaker
│   │   ├── distributed_lock.go    # Distributed locks
│   │   └── rollback.go            # Rollback operations
│   │
│   ├── communication/             # External communication
│   │   ├── telegram.go            # Telegram bot
│   │   ├── gcal.go                # Google Calendar
│   │   └── gmail.go               # Gmail
│   │
│   ├── providers/                 # Providers & services
│   │   ├── get_providers.go
│   │   └── get_services.go
│   │
│   ├── ai/                        # AI agents
│   │   └── agent.go
│   │
│   ├── message/                   # Message parsing
│   │   └── parser.go              # Parse Telegram messages
│   │
│   ├── rag/                       # RAG / Vector search
│   │   └── retrieve.go
│   │
│   └── seed/                      # Seed/provisioning
│       └── provisioning.go
│
├── pkg/                           # Código público/reutilizable
│   ├── types/                     # Type definitions
│   │   └── types.go
│   │
│   └── utils/                     # Utility functions
│       ├── response.go            # Standard contract
│       └── validators.go          # Input validators
│
├── f/                             # Windmill Scripts (17 scripts)
│   ├── booking-orchestrator/      # Orchestrator principal
│   ├── booking-create/            # Crear reserva
│   ├── booking-cancel/            # Cancelar reserva
│   ├── booking-reschedule/        # Reagendar reserva
│   ├── availability-check/        # Verificar disponibilidad
│   ├── circuit-breaker-check/     # Check estado circuit breaker
│   ├── circuit-breaker-record/    # Registrar éxito/fracaso
│   ├── distributed-lock-acquire/  # Adquirir lock
│   ├── distributed-lock-release/  # Liberar lock
│   ├── gcal-create-event/         # Crear evento GCal
│   ├── gcal-delete-event/         # Eliminar evento GCal
│   ├── gmail-send/                # Enviar email
│   ├── telegram-send/             # Enviar mensaje Telegram
│   ├── get-providers/             # Listar proveedores
│   ├── get-services/              # Listar servicios
│   ├── get-providers-by-service/  # Filtrar por servicio
│   └── get-services-by-provider/  # Filtrar por proveedor
│
├── f/telegram-webhook__flow/      # ✅ NUEVO: Flow Telegram Webhook
│   └── flow.yaml                  # Definición del flow
│
├── f/internal/                    # ✅ NUEVO: Scripts internos
│   ├── message_parser/            # Parsear mensajes (NN_02)
│   │   └── main.ts
│   └── ai_agent/                  # AI Agent (NN_03)
│       └── main.ts
│
├── tests/                         # Tests
│   ├── unit/                      # Unit tests
│   ├── integration/               # Integration tests
│   └── e2e/                       # E2E tests
│
├── docs/                          # Documentación
│   ├── LLM_CONTEXT.md             # Contexto para AI/LLM
│   ├── LLM_CONTEXT_MINI.md        # Contexto mínimo
│   ├── DOCKER_DEPLOYMENT.md       # Deploy con Docker
│   ├── DOCKER_COMPOSE_GUIDE.md    # Guía Docker Compose
│   ├── PROJECT_STRUCTURE.md       # Estructura del proyecto
│   └── TELEGRAM_WEBHOOK_SETUP.md  # ✅ NUEVO: Setup Telegram
│
├── workflows-n8n/                 # Workflows originales n8n (ref)
│   ├── NN_01_Booking_Gateway.json
│   ├── NN_02_Message_Parser.json
│   ├── NN_03_AI_Agent.json
│   └── ...
│
├── go.mod                         # Go module definition
├── go.sum                         # Go dependencies
├── Makefile                       # Build commands
├── .env.example                   # Environment template
├── .gitignore                     # Git ignore
└── README.md                      # This file
```

---

## 🚀 Quick Start

### 1. Instalar dependencias
```bash
cd booking-titanium-wm
go mod download
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con tus credenciales
```

### 3. Configurar base de datos
```bash
# Asegurar que la DB existe y las tablas están creadas
export DATABASE_URL="postgresql://user:password@localhost:5432/bookings?sslmode=disable"
```

### 4. Build del proyecto
```bash
go build -o bin/api ./cmd/api
go build -o bin/workers ./cmd/workers
```

### 5. Ejecutar tests
```bash
go test ./...
```

### 6. Ejecutar en desarrollo
```bash
go run ./cmd/api/main.go
```

---

## 📡 Endpoints HTTP

### POST /book-appointment
```bash
curl -X POST http://localhost:8080/book-appointment \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create_booking",
    "provider_id": 1,
    "service_id": 1,
    "start_time": "2026-03-25T10:00:00-03:00",
    "chat_id": "123456789",
    "user_name": "Juan Pérez",
    "user_email": "juan@example.com"
  }'
```

**Response:**
```json
{
  "success": true,
  "error_code": null,
  "error_message": null,
  "data": {
    "id": "uuid-del-booking",
    "status": "CONFIRMED",
    "is_duplicate": false
  },
  "_meta": {
    "source": "DB_Create_Booking",
    "timestamp": "2026-03-24T16:00:00Z",
    "version": "1.0.0"
  }
}
```

### POST /book-appointment (Cancelar)
```bash
curl -X POST http://localhost:8080/book-appointment \
  -H "Content-Type: application/json" \
  -d '{
    "action": "cancel_booking",
    "booking_id": "uuid-del-booking",
    "cancellation_reason": "El cliente canceló"
  }'
```

### POST /book-appointment (Check Availability)
```bash
curl -X POST http://localhost:8080/book-appointment \
  -H "Content-Type: application/json" \
  -d '{
    "action": "check_availability",
    "provider_id": 1,
    "service_id": 1,
    "date": "2026-03-25"
  }'
```

---

## 🧪 Testing

### Tests Unitarios
```bash
go test ./internal/booking/... -v
go test ./pkg/utils/... -v
```

### Tests de Integración
```bash
go test ./tests/integration/... -v
```

### Test con Coverage
```bash
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out
```

---

## 📊 Estado de la Migración a Go

| Componente | Archivo Go | Estado |
|------------|-----------|--------|
| **Types** | `pkg/types/types.go` | ✅ Completado |
| **Utils/Response** | `pkg/utils/response.go` | ✅ Completado |
| **Utils/Validators** | `pkg/utils/validators.go` | ✅ Completado |
| **Core/DB** | `internal/core/db.go` | ✅ Completado |
| **Booking/Create** | `internal/booking/create.go` | ✅ Completado |
| **Booking/Cancel** | `internal/booking/cancel.go` | ✅ Completado |
| **Booking/Reschedule** | `internal/booking/reschedule.go` | ✅ Completado |
| **API Gateway** | `cmd/api/main.go` | ⏳ Pendiente |
| **Circuit Breaker** | `internal/infrastructure/circuit_breaker.go` | ⏳ Pendiente |
| **Distributed Lock** | `internal/infrastructure/distributed_lock.go` | ⏳ Pendiente |
| **Rollback** | `internal/infrastructure/rollback.go` | ⏳ Pendiente |
| **GCal** | `internal/communication/gcal.go` | ⏳ Pendiente |
| **Telegram** | `internal/communication/telegram.go` | ⏳ Pendiente |

**Progreso:** 7/13 componentes completados (54%)

---

## 🔧 Próximos Pasos

### Fase 1 (Completada) ✅
- [x] Types definitions
- [x] Utils (response, validators)
- [x] Database connection
- [x] Booking scripts (create, cancel, reschedule)

### Fase 2 (En Progreso) ⏳
- [ ] API Gateway HTTP server
- [ ] Circuit Breaker script
- [ ] Distributed Lock script
- [ ] Rollback script
- [ ] Google Calendar integration
- [ ] Gmail integration

### Fase 3 (Pendiente) ⏳
- [ ] Telegram integration
- [ ] AI Agent integration
- [ ] RAG integration
- [ ] Seed/Provisioning scripts
- [ ] Tests E2E

---

## 📞 Soporte

- **Documentación Go:** https://go.dev/doc/
- **Documentación Windmill:** https://www.windmill.dev/docs
- **Slack:** #booking-titanium

---

**Última actualización:** 2026-03-24  
**Mantenido por:** Booking Titanium Team
# basic-booking-wm
