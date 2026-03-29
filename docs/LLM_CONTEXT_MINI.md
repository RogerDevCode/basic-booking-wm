# Booking Titanium - Ultra Compact Context

## Stack
Go 1.25 + PostgreSQL 17 + Redis | Windmill (17 scripts) | Docker | Cloudflare | Telegram/Gmail/GCal

## Structure
```
cmd/api/         # HTTP :8080
internal/        # 22 files, 5.5K lines (booking, availability, infrastructure, communication, orchestrator, ai)
f/               # 17 Windmill scripts (package inner, func main)
docker-compose/  # Prod (8 services) + Dev (2 services)
tests/           # 45/47 tests (96%)
```

## API
```
POST /book-appointment | /cancel-booking | /reschedule-booking
GET  /availability | /providers | /services | /health
```

## Response
```json
{"success":bool,"error_code":str,"data":any,"_meta":{}}
```

## Env (Required)
```
DATABASE_URL=postgresql://...
TELEGRAM_BOT_TOKEN=xxx
GMAIL_USERNAME=xxx
GOOGLE_CREDENTIALS_JSON={...}
GROQ_API_KEY=xxx
```

## Patterns
- **Circuit Breaker:** 5 fail→open, 300s→half-open, 3 success→closed
- **Lock:** `lock_{provider}_{time}`, 5min, owner_token
- **Idempotency:** SHA256(provider+service+time+chat)

## Flow (Create Booking)
1. Validate → 2. Idempotency → 3. Circuit Breaker → 4. Lock → 5. Availability → 6. GCal → 7. DB → 8. Release → 9. Return

**Rollback:** Any fail → Delete GCal + Release Lock + DLQ

## Deploy
```bash
# Dev
docker-compose -f docker-compose.dev/up -d
go run ./cmd/api/main.go

# Prod
docker-compose up -d  # Nginx:80/443, Cloudflare: windmill.stax.ink

# Windmill
wmill sync push
```

## Tests
```bash
cd tests && npm test -- --runInBand
```

## Issues
1. Go 1.26 bug → Use `go run` (works)
2. gmail.go/telegram.go → Fix unused vars (15min)
3. Cloudflare token → Get from dash.cloudflare.com

## Status: 🟢 98% Complete
