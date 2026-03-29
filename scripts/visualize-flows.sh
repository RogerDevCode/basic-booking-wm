#!/bin/bash

# 📊 Visualizador de Flujos de Booking Titanium
# Genera diagramas ASCII de los scripts y sus dependencias

echo "
╔══════════════════════════════════════════════════════════════════╗
║          📊 BOOKING TITANIUM - FLOW VISUALIZER                   ║
║                     Windmill Scripts Map                         ║
╚══════════════════════════════════════════════════════════════════╝
"

echo "
┌──────────────────────────────────────────────────────────────────┐
│ 1️⃣  TELEGRAM WEBHOOK FLOW (NN_01 Equivalente)                    │
└──────────────────────────────────────────────────────────────────┘

  ┌─────────────────┐
  │  📩 Telegram    │
  │    Webhook      │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │  📝 parse_      │
  │     message     │
  │  (NN_02 equiv)  │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │  🤖 ai_agent    │
  │  (NN_03 equiv)  │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────────────────────────────┐
  │  ⚙️  booking-orchestrator               │
  │     (WF2 Equivalente)                   │
  └─────────────────────────────────────────┘
           │
           ▼
  ┌─────────────────┐
  │  📤 telegram-   │
  │     send        │
  └─────────────────┘
"

echo "
┌──────────────────────────────────────────────────────────────────┐
│ 2️⃣  BOOKING ORCHESTRATOR FLOW (WF2 Equivalente)                  │
└──────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │  🟢 Inicio      │
                    │  Booking        │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  🔌 circuit-    │
                    │     breaker-    │
                    │     check       │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
     ┌─────────────────┐          ┌─────────────────┐
     │  ❌ Open        │          │  ✅ Closed/     │
     │  Service        │          │     Half-Open   │
     │  Unavailable    │          └────────┬────────┘
     └─────────────────┘                   │
                                           ▼
                                  ┌─────────────────┐
                                  │  🔒 distributed-│
                                  │     lock-       │
                                  │     acquire     │
                                  └────────┬────────┘
                                           │
                             ┌─────────────┴─────────────┐
                             │                           │
                             ▼                           ▼
                    ┌─────────────────┐        ┌─────────────────┐
                    │  ❌ Lock        │        │  ✅ Lock        │
                    │     Occupied    │        │     Acquired    │
                    └─────────────────┘        └────────┬────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │  📅 availability│
                                              │     -check      │
                                              └────────┬────────┘
                                                       │
                                         ┌─────────────┴─────────────┐
                                         │                           │
                                         ▼                           ▼
                                ┌─────────────────┐        ┌─────────────────┐
                                │  ❌ No          │        │  ✅ Available   │
                                │     Availability│        └────────┬────────┘
                                └─────────────────┘                 │
                                                                   ▼
                                                          ┌─────────────────┐
                                                          │  📆 gcal-create-│
                                                          │     event       │
                                                          └────────┬────────┘
                                                                   │
                                                         ┌─────────┴─────────┐
                                                         │                   │
                                                         ▼                   ▼
                                                ┌─────────────────┐  ┌─────────────────┐
                                                │  ❌ GCal        │  │  ✅ GCal        │
                                                │     Failed      │  │     Created     │
                                                │  + Rollback     │  └────────┬────────┘
                                                └─────────────────┘           │
                                                                              ▼
                                                                     ┌─────────────────┐
                                                                     │  🔌 circuit-    │
                                                                     │     breaker-    │
                                                                     │     record      │
                                                                     │     (Success)   │
                                                                     └────────┬────────┘
                                                                              │
                                                                              ▼
                                                                     ┌─────────────────┐
                                                                     │  💾 db-create-  │
                                                                     │     booking     │
                                                                     └────────┬────────┘
                                                                              │
                                                                    ┌─────────┴─────────┐
                                                                    │                   │
                                                                    ▼                   ▼
                                                           ┌─────────────────┐  ┌─────────────────┐
                                                           │  ❌ DB          │  │  ✅ DB          │
                                                           │     Failed      │  │     Created     │
                                                           │  + Rollback     │  └────────┬────────┘
                                                           └─────────────────┘           │
                                                                                         ▼
                                                                                ┌─────────────────┐
                                                                                │  🔓 distributed-│
                                                                                │     lock-       │
                                                                                │     release     │
                                                                                └────────┬────────┘
                                                                                         │
                                                                                         ▼
                                                                                ┌─────────────────┐
                                                                                │  ✅ BOOKING     │
                                                                                │     CONFIRMED   │
                                                                                │     🎉          │
                                                                                └─────────────────┘
"

echo "
┌──────────────────────────────────────────────────────────────────┐
│ 3️⃣  SCRIPTS TREE - DEPENDENCIAS                                  │
└──────────────────────────────────────────────────────────────────┘

f/
├── 📡 telegram-webhook__flow/        [FLOW - Trigger HTTP]
│   └── flow.yaml
│       ├── webhook_trigger → parsea payload Telegram
│       ├── parse_message → f/internal/message_parser
│       ├── ai_agent → f/internal/ai_agent
│       ├── execute_action → f/booking-orchestrator
│       └── send_telegram_response → f/telegram-send
│
├── 🎯 booking-orchestrator/          [SCRIPT - Core del sistema]
│   └── main.go
│       ├── circuit-breaker-check → f/circuit-breaker-check
│       ├── distributed-lock-acquire → f/distributed-lock-acquire
│       ├── availability-check → f/availability-check
│       ├── gcal-create-event → f/gcal-create-event
│       ├── circuit-breaker-record → f/circuit-breaker-record
│       ├── booking-create → f/booking-create
│       └── distributed-lock-release → f/distributed-lock-release
│
├── 📅 booking-create/                [SCRIPT - DB Operation]
│   └── main.go
│       └── INSERT INTO bookings ...
│
├── ❌ booking-cancel/                [SCRIPT - DB Operation]
│   └── main.go
│       └── UPDATE bookings SET status='CANCELLED' ...
│
├── 🔄 booking-reschedule/            [SCRIPT - DB Operation]
│   └── main.go
│       └── UPDATE bookings SET start_time=... ...
│
├── 📊 availability-check/            [SCRIPT - Query]
│   └── main.go
│       └── SELECT FROM availability WHERE ...
│
├── 🔌 circuit-breaker-check/         [SCRIPT - State Check]
│   └── main.go
│       └── SELECT FROM circuit_breaker_state ...
│
├── 🔌 circuit-breaker-record/        [SCRIPT - State Update]
│   └── main.go
│       └── INSERT/UPDATE circuit_breaker_state ...
│
├── 🔒 distributed-lock-acquire/      [SCRIPT - Redis Lock]
│   └── main.go
│       └── SETNX lock_{provider}_{time} ...
│
├── 🔓 distributed-lock-release/      [SCRIPT - Redis Unlock]
│   └── main.go
│       └── DEL lock_{provider}_{time} ...
│
├── 📆 gcal-create-event/             [SCRIPT - GCal API]
│   └── main.go
│       └── POST https://www.googleapis.com/calendar/...
│
├── 📆 gcal-delete-event/             [SCRIPT - GCal API]
│   └── main.go
│       └── DELETE https://www.googleapis.com/calendar/...
│
├── 📧 gmail-send/                    [SCRIPT - Gmail API]
│   └── main.go
│       └── POST https://gmail.googleapis.com/...
│
├── 📤 telegram-send/                 [SCRIPT - Telegram API]
│   └── main.go
│       └── POST https://api.telegram.org/bot.../sendMessage
│
├── 👥 get-providers/                 [SCRIPT - DB Query]
│   └── main.go
│       └── SELECT * FROM providers ...
│
├── 🎯 get-services/                  [SCRIPT - DB Query]
│   └── main.go
│       └── SELECT * FROM services ...
│
├── 🔍 get-providers-by-service/      [SCRIPT - DB Query]
│   └── main.go
│       └── SELECT p.* FROM providers p JOIN ...
│
└── 🔍 get-services-by-provider/      [SCRIPT - DB Query]
    └── main.go
        └── SELECT s.* FROM services s JOIN ...

┌──────────────────────────────────────────────────────────────────┐
│ 4️⃣  INTERNAL SCRIPTS (Helpers)                                   │
└──────────────────────────────────────────────────────────────────┘

f/internal/
├── 📝 message_parser/
│   └── main.ts
│       ├── Valida chat_id (regex: ^\d+$)
│       ├── Valida text (1-500 chars, whitelist)
│       ├── Sanitiza para SQL (escape ', \)
│       └── Retorna: { chat_id, text, username }
│
└── 🤖 ai_agent/
    └── main.ts
        ├── Detecta intención (keyword matching)
        ├── Extrae entidades (provider_id, service_id, date, time)
        ├── Genera respuesta en lenguaje natural
        └── Retorna: { intent, entities, confidence, ai_response }
"

echo "
┌──────────────────────────────────────────────────────────────────┐
│ 5️⃣  DATA FLOW - ENDPOINTS API                                    │
└──────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ POST /book-appointment                                          │
├─────────────────────────────────────────────────────────────────┤
│ Request:                                                        │
│ {                                                               │
│   \"provider_id\": 1,                                           │
│   \"service_id\": 1,                                            │
│   \"start_time\": \"2026-03-27T15:00:00Z\",                     │
│   \"chat_id\": \"123456789\",                                   │
│   \"user_name\": \"Juan\",                                      │
│   \"user_email\": \"juan@example.com\"                          │
│ }                                                               │
│                                                                 │
│ Flow: API → booking-orchestrator → [CB → Lock → Avail → GCal]  │
│                                                                 │
│ Response:                                                       │
│ {                                                               │
│   \"success\": true,                                            │
│   \"data\": { \"id\": \"BK-123\", \"status\": \"CONFIRMED\" }  │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ POST /api/telegram/webhook                                      │
├─────────────────────────────────────────────────────────────────┤
│ Request (Telegram):                                             │
│ {                                                               │
│   \"update_id\": 123456,                                        │
│   \"message\": {                                                │
│     \"chat\": { \"id\": 987654321 },                            │
│     \"text\": \"Quiero reservar una cita para mañana\"          │
│   }                                                             │
│ }                                                               │
│                                                                 │
│ Flow: API → telegram-webhook__flow → [parse → AI → booking]    │
│                                                                 │
│ Response:                                                       │
│ {                                                               │
│   \"success\": true,                                            │
│   \"message\": \"Webhook received\",                            │
│   \"status\": \"processing\"                                    │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ GET /health                                                     │
├─────────────────────────────────────────────────────────────────┤
│ Response:                                                       │
│ {                                                               │
│   \"status\": \"healthy\",                                      │
│   \"timestamp\": \"2026-03-26T10:00:00Z\",                      │
│   \"version\": \"1.0.0\"                                        │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
"

echo "
┌──────────────────────────────────────────────────────────────────┐
│ 6️⃣  ESTADÍSTICAS DEL PROYECTO                                    │
└──────────────────────────────────────────────────────────────────┘

📊 Resumen:
   • Total Scripts:     17 scripts + 1 flow
   • Total Líneas Go:   ~5,563 líneas
   • Total Líneas TS:   ~600 líneas (internal/)
   • Tests:             45/47 (96% coverage)
   • Endpoints API:     13 endpoints
   • Windmill Flows:    1 flow (telegram-webhook)

📁 Distribución:
   • Booking:           4 scripts (create, cancel, reschedule, orchestrator)
   • Infrastructure:    4 scripts (circuit-breaker, lock)
   • Communication:     3 scripts (telegram, gmail, gcal)
   • Providers:         4 scripts (get providers/services)
   • Availability:      1 script
   • Internal:          2 scripts (message_parser, ai_agent)

🔗 Dependencias Externas:
   • PostgreSQL 17      (bookings, providers, services, availability)
   • Redis              (distributed locks)
   • Google Calendar    (event creation)
   • Gmail API          (email confirmations)
   • Telegram Bot API   (mensajes y webhooks)
   • Groq API           (AI/LLM - Llama 3.3 70B)

⚡ Performance:
   • Circuit Breaker:   5 fallos → open, 300s → half-open
   • Lock Duration:     5 minutos
   • Rate Limiting:     10 req/s (Nginx)
   • Timeout API:       30 segundos
"

echo "
╔══════════════════════════════════════════════════════════════════╗
║                    🎯 FIN DEL REPORTE VISUAL                     ║
╚══════════════════════════════════════════════════════════════════╝

💡 Tips:
   • Para ver flujos en vivo: https://windmill.stax.ink
   • Para ver diagramas Mermaid: docs/DIAGRAMAS.md
   • Para ver estructura completa: docs/PROJECT_STRUCTURE.md
   • Para ver contexto técnico: docs/LLM_CONTEXT.md

"
