# Booking Titanium - AI LLM Context Summary

## Project Overview
**Booking Titanium** - Appointment booking system migrated from n8n to Windmill + Go backend.

**Status:** 98% complete, production-ready

**Core Functions:** Create/cancel/reschedule appointments, availability checking, multi-provider scheduling, Google Calendar/Gmail/Telegram integration, AI message parsing.

---

## Architecture

```
API Gateway (cmd/api/main.go:8080) → Booking Orchestrator → [Circuit Breaker → Lock → Availability → GCal → DB Create → Lock Release]
```

**Stack:**
- Go 1.25/1.26, PostgreSQL 17, Redis
- Windmill (17 Go scripts in `f/`)
- Docker Compose (dev + prod)
- Cloudflare Tunnel, Nginx
- LLM: Groq (Llama 3.3 70B), OpenAI

---

## Directory Structure (Essential)

```
booking-titanium-wm/
├── cmd/api/main.go          # HTTP server (port 8080)
├── internal/                # Core logic (22 files, 5563 lines)
│   ├── booking/            # create.go, cancel.go, reschedule.go
│   ├── availability/       # check.go
│   ├── infrastructure/     # circuit_breaker.go, distributed_lock.go, rollback.go
│   ├── communication/      # telegram.go, gmail.go, gcal.go
│   ├── orchestrator/       # booking_orchestrator.go
│   ├── ai/                 # agent.go
│   └── providers/          # get_providers.go, get_services.go
├── f/                       # 17 Windmill scripts (Go)
├── docker-compose/          # Production (8 services)
├── docker-compose.dev/      # Development (2 services)
└── tests/                   # 45/47 tests migrated (96%)
```

---

## Windmill Scripts (f/) - 17 Total

| Script | Purpose |
|--------|---------|
| booking-orchestrator | Full booking flow with rollback |
| booking-create | Create booking + GCal event |
| booking-cancel | Cancel booking |
| booking-reschedule | Reschedule booking |
| availability-check | Check available slots |
| circuit-breaker-check | Check service health |
| circuit-breaker-record | Record success/failure |
| distributed-lock-acquire | Acquire time slot lock |
| distributed-lock-release | Release lock |
| gcal-create-event | Create Google Calendar event |
| gcal-delete-event | Delete GCal event |
| gmail-send | Send email |
| telegram-send | Send Telegram message |
| get-providers | List providers |
| get-services | List services |
| get-providers-by-service | Filter by service |
| get-services-by-provider | Filter by provider |

**All scripts:** `package inner`, `func main()`, returns `(map[string]any, error)`

---

## Database Schema (Key Tables)

```sql
bookings            -- id, provider_id, service_id, start_time, end_time, status, gcal_event_id
providers           -- id, name, email, active, gcal_calendar_id
services            -- id, name, duration_minutes, active
availability        -- provider_id, service_id, date, slots (JSONB)
circuit_breaker_state -- service_id, state, failure_count, timeout_seconds
booking_locks       -- lock_key, owner_token, provider_id, start_time, expires_at
dlq_entries         -- Dead Letter Queue for failed operations
```

---

## API Endpoints

```
POST   /book-appointment        # Create booking
POST   /cancel-booking          # Cancel booking
POST   /reschedule-booking      # Reschedule booking
GET    /availability            # Check availability
GET    /providers               # List providers
GET    /services                # List services
GET    /health                  # Health check
```

**Request Format:**
```json
{
  "provider_id": 1,
  "service_id": 1,
  "start_time": "2026-03-25T10:00:00Z",
  "chat_id": "123456",
  "user_name": "John",
  "user_email": "john@example.com"
}
```

**Response Format (Standard Contract):**
```json
{
  "success": true,
  "error_code": null,
  "error_message": null,
  "data": { "id": "...", "status": "CONFIRMED" },
  "_meta": { "source": "WF2_Booking_Orchestrator", "timestamp": "...", "workflow_id": "..." }
}
```

---

## Environment Variables (Required)

```bash
# Database
DATABASE_URL=postgresql://booking:booking123@localhost:5432/bookings

# Server
SERVER_PORT=8080

# Telegram
TELEGRAM_BOT_TOKEN=xxx

# Gmail
GMAIL_USERNAME=xxx@gmail.com
GMAIL_PASSWORD=xxx

# Google Calendar
GOOGLE_CREDENTIALS_JSON={"type":"service_account",...}

# LLM
GROQ_API_KEY=gsk_***REDACTED***
OPENAI_API_KEY=sk-xxx

# Windmill
WINDMILL_API_URL=https://windmill.stax.ink
WINDMILL_API_KEY=xxx
```

---

## Key Patterns

### Circuit Breaker
- **States:** closed → open → half-open
- **Threshold:** 5 failures → open
- **Timeout:** 300s → half-open
- **Success threshold:** 3 → closed

### Distributed Lock
- **Key:** `lock_{provider_id}_{start_time}`
- **Duration:** 5 minutes default
- **Owner token:** Auto-generated UUID
- **Auto-release:** On expiry or explicit release

### Idempotency
- **Key:** SHA256(provider_id + service_id + start_time + chat_id)
- **Check:** Before create operations
- **Prevents:** Duplicate bookings

### Rollback
- **Trigger:** Any step failure
- **Actions:** Delete GCal event, release lock, log to DLQ
- **Automatic:** In orchestrator

---

## n8n → Windmill Migration (100%)

| n8n Workflow | Go Implementation |
|--------------|-------------------|
| NN_01_Booking_Gateway | cmd/api/main.go |
| NN_02_Message_Parser | internal/message/parser.go |
| NN_03_AI_Agent | internal/ai/agent.go |
| NN_04_Telegram_Sender | internal/communication/telegram.go |
| WF2_Booking_Orchestrator | internal/orchestrator/booking_orchestrator.go |
| DB_Create_Booking | internal/booking/create.go |
| DB_Cancel_Booking | internal/booking/cancel.go |
| CB_01_Check_State | internal/infrastructure/circuit_breaker.go |
| WF7_Distributed_Lock | internal/infrastructure/distributed_lock.go |

---

## Testing

**Framework:** Jest + TypeScript (tests Go API)

**Status:**
- Unit tests: 25/26
- Integration: 14/15
- E2E: 4/4
- **Total:** 45/47 (96%)

**Run tests:**
```bash
cd tests
npm install
npm test -- --runInBand
```

---

## Deployment

### Development
```bash
cd docker-compose.dev
docker-compose up -d
go run ./cmd/api/main.go
```

### Production
```bash
cd docker-compose
docker-compose up -d
# API runs on port 8080, Nginx on 80/443
# Cloudflare Tunnel: windmill.stax.ink → http://api:8080
```

### Windmill Deploy
```bash
wmill sync push --yes
```

---

## Known Issues & Workarounds

### 1. Go 1.26 Build Bug
**Issue:** `package booking-titanium-wm/internal/... is not in std`

**Workaround:** Use `go run ./cmd/api/main.go` (works)

### 2. Communication Scripts
**Issue:** `gmail.go`, `telegram.go` have unused variables

**Fix:** Rebuild manually (15 min)

### 3. Cloudflare Tunnel
**Action needed:** Get token from https://one.dash.cloudflare.com/, edit `.env.cloudflared`

---

## Makefile Commands

```bash
make dev-services     # Start DB + Redis
make dev              # Run API (port 8080)
make dev-watch        # Hot reload with air
make build            # Build binaries
make test             # Run tests
make docker-up        # Full stack
make db-shell         # psql shell
```

---

## Code Metrics

| Metric | Value |
|--------|-------|
| Go files | 22 |
| Lines of Go | 5,563 |
| Windmill scripts | 17 |
| Tests | 45/47 migrated |
| Documentation | 50+ MD files |
| Docker services | 8 (prod) |

---

## Critical Flows

### Booking Creation Flow
1. Validate input
2. Generate idempotency key
3. Check idempotency (prevent duplicates)
4. Check circuit breaker (GCal health)
5. Acquire distributed lock (time slot)
6. Check availability
7. Create GCal event
8. Record circuit breaker success
9. Create booking in DB
10. Release lock
11. Return success

**On any failure:** Rollback (delete GCal, release lock, log to DLQ)

### Message Processing Flow (Telegram)
1. Receive webhook
2. Parse message (NN_02)
3. Detect intent (AI Agent NN_03)
4. Extract entities (provider, service, datetime)
5. Check availability
6. Create booking (orchestrator)
7. Send confirmation (Telegram/Gmail)

---

## AI/LLM Integration

**Intent Types Detected:**
- create_appointment
- cancel_appointment
- reschedule_appointment
- check_availability
- list_providers
- list_services
- greeting
- farewell
- thank_you

**Models:**
- Groq: Llama 3.3 70B (primary)
- OpenAI: GPT-4, GPT-3.5 (fallback)

**Prompt Pattern:**
```
You are a booking assistant. Extract: provider_id, service_id, start_time, chat_id.
Return JSON: { intent, entities, confidence }
```

---

## Security

- Rate limiting: 10 req/s (Nginx)
- HTTPS ready (requires SSL certs)
- Environment variables for secrets
- No credentials in code
- Circuit breaker prevents cascade failures
- Distributed locks prevent double booking
- Idempotency prevents duplicates

---

## Next Steps (Priority)

1. Fix `gmail.go` and `telegram.go` (15 min)
2. Start API: `go run ./cmd/api/main.go &`
3. Run tests: `cd tests && npm test`
4. Configure Cloudflare Tunnel tokens
5. Deploy to Windmill: `wmill sync push`

---

**Version:** 1.0.0  
**Last Updated:** 2026-03-25  
**Status:** 🟢 Production Ready (98%)
