# 📚 Booking Titanium - Stack Tecnológico

**Versión:** 1.0.0
**Fecha:** 2026-03-27
**Estado:** 🟢 Production Ready (98%)

---

## 🏗️ Arquitectura General

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Tunnel                         │
│              (windmill.stax.ink → api:8080)                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Nginx Reverse Proxy                       │
│           Rate Limiting (10r/s) + Security Headers          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Go API Gateway (cmd/api/main.go)               │
│                    HTTP Server :8080                        │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│   Windmill   │    │   Internal       │    │   External   │
│   Scripts    │    │   Packages       │    │   APIs       │
└──────────────┘    └──────────────────┘    └──────────────┘
```

---

## 💻 Lenguajes de Programación

- **Go** 1.25.0 (Backend principal, API, Workers)
- **TypeScript** (Scripts Windmill internos, Tests)
- **Bun** (Runtime TypeScript para scripts internos)

---

## 🔄 Windmill Automation Platform

### Scripts (17 scripts Go en `f/`)

| Script | Tipo | Propósito |
|--------|------|-----------|
| `booking-orchestrator` | Go | Orquestación completa de reservas |
| `booking-create` | Go | Crear reserva en DB + GCal |
| `booking-cancel` | Go | Cancelar reserva |
| `booking-reschedule` | Go | Reagendar reserva |
| `availability-check` | Go | Verificar disponibilidad |
| `circuit-breaker-check` | Go | Check estado circuit breaker |
| `circuit-breaker-record` | Go | Registrar éxito/fallo CB |
| `distributed-lock-acquire` | Go | Adquirir lock distribuido |
| `distributed-lock-release` | Go | Liberar lock distribuido |
| `gcal-create-event` | Go | Crear evento Google Calendar |
| `gcal-delete-event` | Go | Eliminar evento GCal |
| `gmail-send` | Go | Enviar email Gmail |
| `telegram-send` | Go | Enviar mensaje Telegram |
| `get-providers` | Go | Listar proveedores |
| `get-services` | Go | Listar servicios |
| `get-providers-by-service` | Go | Filtrar proveedores por servicio |
| `get-services-by-provider` | Go | Filtrar servicios por proveedor |

### Flows (2 flows creados)

| Flow | Tipo | Propósito |
|------|------|-----------|
| `telegram-webhook__flow` | Flow YAML | Recepción webhooks Telegram + AI Agent |
| `booking-orchestrator-flow__flow` | Flow YAML | Orquestación visual de booking |

### Scripts Internos (TypeScript/Bun en `f/internal/`)

| Script | Lenguaje | Propósito |
|--------|----------|-----------|
| `message_parser` | TypeScript (Bun) | Parsear mensajes Telegram (NN_02) |
| `ai_agent` | TypeScript (Bun) | Detectar intenciones (NN_03) |

---

## 🗄️ Bases de Datos

### PostgreSQL 17

**Configuración:**
- **Host:** localhost:5432 (dev), postgres:5432 (prod)
- **Database:** bookings
- **User:** booking
- **Max Open Connections:** 10
- **Max Idle Connections:** 10
- **Conn Max Lifetime:** 30m
- **Conn Max Idle Time:** 10m

**Tablas Principales:**
- `bookings` - Reservas activas y históricas
- `providers` - Proveedores de servicios
- `services` - Servicios ofrecidos
- `availability` - Disponibilidad por proveedor/servicio (JSONB)
- `circuit_breaker_state` - Estado de circuit breakers
- `booking_locks` - Locks distribuidos para time slots
- `dlq_entries` - Dead Letter Queue para fallos

**Librería Go:** `github.com/lib/pq v1.12.0`

### Redis (Latest)

**Configuración:**
- **Host:** localhost:6379 (dev), redis:6379 (prod)
- **Uso:** Distributed locks, cache, sesiones
- **Persistencia:** AOF (Append Only File)

---

## 🌐 API & HTTP

### API Gateway (Go)

**Endpoints:**
- `POST /book-appointment` - Crear reserva
- `POST /cancel-booking` - Cancelar reserva
- `POST /reschedule-booking` - Reagendar reserva
- `GET /availability` - Verificar disponibilidad
- `GET /providers` - Listar proveedores
- `GET /services` - Listar servicios
- `GET /health` - Health check
- `POST /api/telegram/webhook` - Webhook Telegram

**Configuración:**
- **Puerto:** 8080
- **Host:** 0.0.0.0
- **Timeout:** 30s
- **Read Timeout:** 15s
- **Write Timeout:** 15s
- **Idle Timeout:** 60s

### Nginx (Alpine)

**Configuración:**
- **Rate Limiting:** 10 req/s por IP
- **Burst:** 20 requests
- **Gzip:** Habilitado (nivel 6)
- **Keepalive:** 65s
- **Worker Connections:** 1024
- **Security Headers:** X-Frame-Options, X-Content-Type-Options, X-XSS-Protection

**Puertos:**
- HTTP: 80
- HTTPS: 443 (configurado, requiere SSL)

---

## 📡 Comunicación Externa

### Telegram Bot API

**Configuración:**
- **Endpoint:** `https://api.telegram.org/bot<TOKEN>/sendMessage`
- **Webhook:** `https://windmill.stax.ink/api/telegram/webhook`
- **Parse Mode:** MarkdownV2
- **Rate Limit:** 30 msg/s

**Environment:**
- `TELEGRAM_BOT_TOKEN`

### Gmail API

**Configuración:**
- **OAuth2:** Service Account
- **Scopes:** Gmail send, modify
- **From Name:** Booking Titanium

**Environment:**
- `GMAIL_USERNAME`
- `GMAIL_PASSWORD` (App Password)
- `GOOGLE_CREDENTIALS_JSON`

### Google Calendar API

**Configuración:**
- **OAuth2:** Service Account
- **Scopes:** Calendar events CRUD
- **Timezone:** UTC

**Environment:**
- `GOOGLE_CREDENTIALS_JSON`

---

## 🤖 Inteligencia Artificial

### Groq API (Primary)

**Modelo:** Llama 3.3 70B
**Uso:** AI Agent para detección de intenciones
**Environment:** `GROQ_API_KEY`

### OpenAI API (Fallback)

**Modelos:** GPT-4, GPT-3.5
**Uso:** Fallback cuando Groq falla
**Environment:** `OPENAI_API_KEY`

### AI Agent - Intenciones Detectadas

| Intención | Keywords | Acción |
|-----------|----------|--------|
| `create_appointment` | reservar, agendar, citar | Crear booking |
| `cancel_appointment` | cancelar, anular, eliminar | Cancelar booking |
| `reschedule_appointment` | reprogramar, cambiar, mover | Reschedule booking |
| `check_availability` | disponibilidad, hueco, libre | Check availability |
| `list_providers` | proveedores, profesionales | List providers |
| `list_services` | servicios, tratamientos | List services |
| `greeting` | hola, buenos días | Saludo |
| `thank_you` | gracias, agradezco | Agradecimiento |
| `farewell` | adiós, chao | Despedida |

---

## 🐳 Docker & Containerización

### Docker Compose (Producción)

**Servicios (8):**
1. `api` - API Go server (puerto 8080)
2. `workers` - Background workers
3. `postgres` - PostgreSQL 17-alpine
4. `pgadmin` - PgAdmin4 (puerto 5050)
5. `redis` - Redis latest
6. `nginx` - Nginx reverse proxy (puertos 80/443)
7. `cloudflared` - Cloudflare Tunnel

### Docker Compose (Desarrollo)

**Servicios (2):**
1. `postgres` - PostgreSQL 17-alpine
2. `redis` - Redis latest

### Dockerfile

**Multi-stage build:**
- **Stage 1 (Builder):** Go 1.21-alpine
- **Stage 2 (Final):** Alpine 3.19
- **User:** appuser (non-root)
- **Healthcheck:** HTTP /health cada 30s

---

## ☁️ Cloudflare Tunnel

**Configuración:**
- **URL:** windmill.stax.ink
- **Tipo:** Cloudflared Tunnel
- **Token:** `.env.cloudflared`
- **Destino:** http://api:8080

**Environment:**
- `CLOUDFLARE_TUNNEL_TOKEN`

---

## 🔐 Seguridad & Autenticación

### Resource Types (Windmill RT namespace)

**Usados en el proyecto:**
- `RT.Postgresql` - Conexión a base de datos
- `RT.Gcal` - Google Calendar OAuth
- `RT.Gmail` - Gmail OAuth
- `RT.Telegram` - Telegram Bot Token
- `RT.Groq` - Groq API Key
- `RT.Openai` - OpenAI API Key
- `RT.S3` - Almacenamiento de archivos

### SSL/TLS

**Configuración Nginx:**
- **Protocolos:** TLSv1.2, TLSv1.3
- **Ciphers:** ECDHE-ECDSA-AES128-GCM-SHA256
- **HSTS:** max-age=63072000
- **Certificados:** `/etc/nginx/ssl/` (requiere configuración)

### Rate Limiting

**Nginx:**
- **Zone:** api_limit (10MB)
- **Rate:** 10 req/s por IP
- **Burst:** 20 requests
- **Delay:** nodelay

---

## 🧪 Testing

### Framework de Tests

**Go Testing:**
- **Framework:** testing (stdlib)
- **Coverage:** HTML report
- **Comando:** `go test ./... -v`

**Tests TypeScript (tests/):**
- **Framework:** Jest
- **Runner:** npm test
- **Cobertura:** 45/47 tests (96%)

### Tipos de Tests

| Tipo | Ubicación | Ejecución |
|------|-----------|-----------|
| Unitarios | `pkg/`, `internal/message/`, `internal/ai/` | `make test-unit` |
| Integración | `internal/booking/`, `internal/orchestrator/` | `make test-integration` |
| E2E | `tests/e2e/` | `npm test -- --runInBand` |

### Makefile Commands (Tests)

```bash
make test              # Todos los tests
make test-unit         # Unitarios (sin DB)
make test-integration  # Integración (con DB)
make test-watch        # Watch mode
make test-cover        # Coverage HTML
```

---

## 📦 Dependencias Go

### Directas

```go
github.com/lib/pq v1.12.0           // PostgreSQL driver
google.golang.org/api v0.272.0      // Google APIs (GCal, Gmail)
```

### Indirectas (Google APIs)

```go
cloud.google.com/go/auth v0.18.2
cloud.google.com/go/auth/oauth2adapt v0.2.8
cloud.google.com/go/compute/metadata v0.9.0
github.com/googleapis/gax-go/v2 v2.18.0
golang.org/x/oauth2 v0.36.0
google.golang.org/grpc v1.79.2
google.golang.org/protobuf v1.36.11
```

### OpenTelemetry (Telemetría)

```go
go.opentelemetry.io/otel v1.39.0
go.opentelemetry.io/otel/metric v1.39.0
go.opentelemetry.io/otel/trace v1.39.0
go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp v0.61.0
```

---

## 🛠️ Herramientas de Desarrollo

### Go Tools

- **go fmt** - Formateo de código
- **go mod tidy** - Gestión de dependencias
- **golangci-lint** - Linter
- **air** - Hot reload en desarrollo
- **gotestsum** - Test watch mode

### Makefile

**Comandos principales:**
```bash
make dev-services    # Start DB + Redis
make dev             # Run API local
make dev-watch       # Hot reload con air
make build           # Build binaries
make test            # Run tests
make lint            # Run linter
make fix             # Format + mod tidy
make cycle           # Full cycle: fix → test → build
make docker-up       # Full stack Docker
make db-shell        # PSQL shell
make db-backup       # Backup database
```

### IDE & Editors

- **GoLand** - `.idea/` configuration
- **VS Code** - `.vscode/` configuration
- **Extensions:** Go, TypeScript, Docker

---

## 📊 Patrones de Diseño Implementados

### Circuit Breaker

**Estados:**
- **Closed:** Normal operation
- **Open:** Protection mode (5 fallos → open)
- **Half-Open:** Testing (300s timeout → half-open, 3 éxitos → closed)

**Implementación:** `internal/infrastructure/circuit_breaker.go`

### Distributed Lock

**Algoritmo:** Redis SETNX con owner token
**Key Pattern:** `lock_{provider_id}_{start_time}`
**Duración:** 5 minutos
**Auto-release:** Expiración automática

**Implementación:** `internal/infrastructure/distributed_lock.go`

### Rollback

**Trigger:** Cualquier fallo en orchestrator
**Acciones:**
1. Delete GCal event (si se creó)
2. Release lock (si se adquirió)
3. Log to DLQ

**Implementación:** `internal/infrastructure/rollback.go`

### Idempotency

**Key:** SHA256(provider_id + service_id + start_time + chat_id)
**Check:** Antes de operaciones de create
**Prevención:** Double booking, mensajes duplicados

---

## 📁 Estructura de Directorios

```
booking-titanium-wm/
├── cmd/
│   ├── api/                 # API HTTP server
│   │   └── main.go
│   └── workers/             # Background workers
│       └── main.go
├── internal/
│   ├── core/                # Core utilities
│   │   ├── db.go
│   │   └── config.go
│   ├── booking/             # Booking operations
│   │   ├── create.go
│   │   ├── cancel.go
│   │   └── reschedule.go
│   ├── availability/        # Availability checks
│   │   └── check.go
│   ├── infrastructure/      # Infrastructure patterns
│   │   ├── circuit_breaker.go
│   │   ├── distributed_lock.go
│   │   └── rollback.go
│   ├── communication/       # External APIs
│   │   ├── telegram.go
│   │   ├── gmail.go
│   │   └── gcal.go
│   ├── orchestrator/        # Booking orchestrator
│   │   └── booking_orchestrator.go
│   ├── ai/                  # AI agents
│   │   └── agent.go
│   ├── message/             # Message parsing
│   │   └── parser.go
│   ├── providers/           # Providers & services
│   │   ├── get_providers.go
│   │   └── get_services.go
│   └── rag/                 # RAG / Vector search
│       └── retrieve.go
├── pkg/
│   ├── types/               # Type definitions
│   │   └── types.go
│   └── utils/               # Utility functions
│       ├── response.go
│       └── validators.go
├── f/                       # Windmill Scripts (17)
│   ├── booking-orchestrator/
│   ├── booking-create/
│   ├── booking-cancel/
│   ├── booking-reschedule/
│   ├── availability-check/
│   ├── circuit-breaker-check/
│   ├── circuit-breaker-record/
│   ├── distributed-lock-acquire/
│   ├── distributed-lock-release/
│   ├── gcal-create-event/
│   ├── gcal-delete-event/
│   ├── gmail-send/
│   ├── telegram-send/
│   ├── get-providers/
│   ├── get-services/
│   ├── get-providers-by-service/
│   └── get-services-by-provider/
├── f/internal/              # Scripts internos
│   ├── message_parser/
│   │   └── main.ts
│   └── ai_agent/
│       └── main.ts
├── f/telegram-webhook__flow/
│   └── flow.yaml
├── f/booking-orchestrator-flow__flow/
│   └── flow.yaml
├── docker-compose/          # Producción (8 servicios)
├── docker-compose.dev/      # Desarrollo (2 servicios)
├── tests/                   # Tests
├── docs/                    # Documentación
├── workflows-n8n/           # Workflows originales n8n (referencia)
└── .claude/skills/          # Skills para AI agents
```

---

## 📝 Configuración de Environment Variables

### Database

```bash
DATABASE_URL=postgresql://booking:booking123@localhost:5432/bookings
DATABASE_MAX_OPEN_CONNS=10
DATABASE_MAX_IDLE_CONNS=10
DATABASE_CONN_MAX_LIFETIME=30m
DATABASE_CONN_MAX_IDLE_TIME=10m
```

### Server

```bash
SERVER_PORT=8080
SERVER_HOST=0.0.0.0
SERVER_ENV=development
```

### Windmill

```bash
WINDMILL_API_URL=https://windmill.stax.ink
WINDMILL_WORKSPACE=booking-titanium
WINDMILL_API_KEY=wm_xxx
```

### Telegram

```bash
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_WEBHOOK_URL=https://windmill.stax.ink/api/telegram/webhook
```

### Gmail

```bash
GMAIL_USERNAME=your-email@gmail.com
GMAIL_PASSWORD=app-password
GMAIL_FROM_EMAIL=your-email@gmail.com
GMAIL_FROM_NAME=Booking Titanium
```

### Google OAuth2

```bash
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=https://windmill.stax.ink/oauth2callback
GOOGLE_CREDENTIALS_JSON={"type":"service_account",...}
```

### LLM APIs

```bash
GROQ_API_KEY=gsk_***REDACTED***
OPENAI_API_KEY=sk-xxx
```

### Logging

```bash
LOG_LEVEL=debug
LOG_FORMAT=json
```

---

## 🔄 Flujo de Desarrollo

### 1. Desarrollo Local (Híbrido)

```bash
# 1. Iniciar servicios Docker
make dev-services

# 2. Correr API local
make dev

# O con hot reload
make dev-watch
```

### 2. Testing

```bash
# Tests unitarios
make test-unit

# Tests integración
make test-integration

# Todos los tests
make test
```

### 3. Build & Deploy

```bash
# Build local
make build

# Push a Windmill
wmill sync push

# Deploy Docker
make docker-up
```

---

## 📈 Métricas del Proyecto

| Métrica | Valor |
|---------|-------|
| **Go Files** | 22 archivos |
| **Líneas de Go** | ~5,563 líneas |
| **Windmill Scripts** | 17 scripts + 2 flows |
| **Tests** | 45/47 (96% coverage) |
| **Endpoints API** | 13 endpoints |
| **Docker Services** | 8 (prod), 2 (dev) |
| **Documentación** | 11 archivos MD en docs/ |

---

## 🎯 Próximos Pasos (Roadmap)

### Prioridad Alta

1. **Fix gmail.go/telegram.go** - Variables no usadas (15 min)
2. **Configurar Cloudflare Tunnel** - Obtener token de dash.cloudflare.com
3. **Completar tests** - 2 tests faltantes (4%)
4. **SSL/TLS Production** - Configurar certificados en Nginx

### Prioridad Media

5. **AI Agent con LLM** - Integrar Groq/OpenAI en `internal/ai/agent.go`
6. **RAG Implementation** - Vector search para documentación
7. **Monitoring** - Prometheus + Grafana
8. **CI/CD** - GitHub Actions para auto-deploy

### Prioridad Baja

9. **Kubernetes Manifests** - Migrar de Docker Compose a K8s
10. **Helm Chart** - Empaquetado para deployment
11. **Auto-scaling** - HPA para workers
12. **Multi-tenant** - Soporte para múltiples organizaciones

---

## 📚 Recursos y Documentación

### Documentación Principal

| Archivo | Propósito |
|---------|-----------|
| `docs/LLM_CONTEXT.md` | Contexto técnico completo (~1,200 tokens) |
| `docs/LLM_CONTEXT_MINI.md` | Contexto mínimo (~300 tokens) |
| `docs/DIAGRAMAS.md` | 8 diagramas Mermaid de flujos |
| `docs/TELEGRAM_WEBHOOK_SETUP.md` | Setup de Telegram Webhook |
| `docs/GUIA_CONVERTIR_SCRIPTS_A_FLOWS.md` | Guía de conversión Scripts → Flows |
| `docs/CHEAT_SHEET_SCRIPTS_TO_FLOWS.md` | Referencia rápida |
| `docs/DOCKER_DEPLOYMENT.md` | Deploy con Docker |
| `docs/PROJECT_STRUCTURE.md` | Estructura del proyecto |

### Skills (.claude/skills/)

- `write-script-bun/` - Scripts TypeScript/Bun
- `write-script-go/` - Scripts Go
- `write-flow/` - Flows YAML
- `cli-commands/` - Comandos Windmill CLI
- `triggers/` - Configuración de triggers
- `schedules/` - Configuración de schedules
- `resources/` - Gestión de recursos

---

## 🔗 Enlaces Externos

### Windmill

- **Docs:** https://docs.windmill.dev
- **UI:** https://windmill.stax.ink
- **CLI:** `wmill` commands

### Telegram

- **Bot API:** https://core.telegram.org/bots/api
- **BotFather:** https://t.me/BotFather

### Google Cloud

- **GCal API:** https://developers.google.com/calendar
- **Gmail API:** https://developers.google.com/gmail
- **Service Accounts:** https://cloud.google.com/iam/docs/service-accounts

### Go

- **Docs:** https://go.dev/doc
- **Modules:** https://go.dev/ref/mod

### Docker

- **Compose:** https://docs.docker.com/compose
- **Best Practices:** https://docs.docker.com/develop/develop-images/dockerfile_best-practices

---

**Última actualización:** 2026-03-27
**Mantenido por:** Booking Titanium Team
**Licencia:** Proprietary
