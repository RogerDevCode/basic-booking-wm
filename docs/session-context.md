# Session Context — Booking Titanium

> Última actualización: 2026-04-04
> Último commit: `8acdb0b` — feat: add DB integration tests with testcontainers (21 tests)
> Commits de esta sesión: 12

---

## Estado Actual

| Check | Resultado |
|-------|-----------|
| TypeScript strict (`tsc --noEmit`) | ✅ 0 errores |
| ESLint strict (`eslint f/ --max-warnings 0`) | ✅ 0 errores, 0 warnings |
| Tests unitarios | 111 passing |
| Tests integración DB | 21 passing |
| Tests LLM (con API keys) | 100/100 passing |
| **Total tests** | **132/132 passing (100%)** |
| Scripts en Windmill | 18 scripts TypeScript (Bun) |
| Versión | v2.3.1 |

---

## Stack

- **Runtime:** Bun (TypeScript 6.0)
- **Plataforma:** Windmill EE v1.673.0
- **DB:** PostgreSQL 17 (Neon) + pgvector
- **Cache/Locks:** Redis (ioredis)
- **Calendar:** Google Calendar API (googleapis, Service Account)
- **Email:** Gmail API + Nodemailer
- **Chat:** Telegram Bot API (webhook)
- **AI:** Groq (Llama 3.3 70B) + OpenAI fallback + GROQ_API_KEY_2 fallback
- **Validación:** Zod 4.x
- **Testing:** Vitest + testcontainers/postgresql

---

## Estructura de Scripts (`f/`)

### Core Booking
| Script | Ruta | Función |
|--------|------|---------|
| Availability Check | `f/availability_check/main.ts` | Slots libres por provider/fecha |
| Booking Create | `f/booking_create/main.ts` | Crear reserva con idempotencia |
| Booking Cancel | `f/booking_cancel/main.ts` | Cancelar reserva |
| Booking Search | `f/booking_search/main.ts` | Búsqueda/filtro de reservas |
| Booking Wizard | `f/booking_wizard/main.ts` | Flujo multi-step Telegram |
| Booking Orchestrator | `f/booking_orchestrator/main.ts` | Routing de intents (AI → acción) |

### Integraciones
| Script | Ruta | Función |
|--------|------|---------|
| GCal Reconcile | `f/gcal_reconcile/main.ts` | Cron: reintentar syncs pendientes |
| GCal Sync | `f/gcal_sync/main.ts` | Sync booking → Google Calendar |
| GCal Webhook Receiver | `f/gcal_webhook_receiver/main.ts` | Push notifications GCal → DB |
| Gmail Send | `f/gmail_send/main.ts` | Envío de emails (confirmaciones) |
| Telegram Send | `f/telegram_send/main.ts` | Envío de mensajes Telegram |
| Telegram Callback | `f/telegram_callback/main.ts` | Callback handler |
| Telegram Menu | `f/telegram_menu/main.ts` | Menú principal |
| Telegram Auto Register | `f/telegram_auto_register/main.ts` | Registro automático de usuarios |

### Infraestructura
| Script | Ruta | Función |
|--------|------|---------|
| Circuit Breaker | `f/circuit_breaker/main.ts` | Health monitor + aislamiento de fallos |
| Distributed Lock | `f/distributed_lock/main.ts` | Advisory locks (previene double-booking) |
| DLQ Processor | `f/dlq_processor/main.ts` | Dead Letter Queue handler |
| Health Check | `f/health_check/main.ts` | Verifica DB, GCal, Telegram |
| Reminder Config | `f/reminder_config/main.ts` | Config de recordatorios por paciente |
| Reminder Cron | `f/reminder_cron/main.ts` | Cron de recordatorios |
| Noshow Trigger | `f/noshow_trigger/main.ts` | Marca no-shows automáticos |
| RAG Query | `f/rag_query/main.ts` | Búsqueda en knowledge base |
| Provider Manage | `f/provider_manage/main.ts` | Gestión de providers |
| Patient Register | `f/patient_register/main.ts` | Registro de pacientes |
| Provider Agenda | `f/provider_agenda/main.ts` | Agenda del provider |
| Conversation Logger | `f/conversation_logger/main.ts` | Log de conversaciones |

### Web API
| Script | Ruta | Función |
|--------|------|---------|
| Web Booking API | `f/web_booking_api/main.ts` | CRUD reservas |
| Web Admin Users | `f/web_admin_users/main.ts` | CRUD usuarios |
| Web Admin Dashboard | `f/web_admin_dashboard/main.ts` | Dashboard admin |
| Web Auth * | `f/web_auth_*/main.ts` | Auth flows |
| Web Patient * | `f/web_patient_*/main.ts` | Patient endpoints |
| Web Provider * | `f/web_provider_*/main.ts` | Provider endpoints |
| Web Waitlist | `f/web_waitlist/main.ts` | Lista de espera |
| Web Provider Notes | `f/web_provider_notes/main.ts` | Notas clínicas |

### Internal
| Módulo | Ruta | Función |
|--------|------|---------|
| AI Agent | `f/internal/ai_agent/main.ts` | Detección de intents + LLM |
| AI Agent LLM Client | `f/internal/ai_agent/llm-client.ts` | Groq + OpenAI con retry + cache |
| AI Agent Guardrails | `f/internal/ai_agent/guardrails.ts` | Validación de output LLM |
| AI Agent Constants | `f/internal/ai_agent/constants.ts` | Keywords, intents, typos |
| Logger | `f/internal/logger/index.ts` | Logger estructurado |
| Retry | `f/internal/retry/index.ts` | Retry con backoff exponencial |
| Cache | `f/internal/cache/index.ts` | Semantic cache con Redis |
| DB Types | `f/internal/db-types/index.ts` | Interfaces tipadas de DB |
| Message Parser | `f/internal/message_parser/main.ts` | Parseo de mensajes Telegram |

### Tests
| Archivo | Tipo | Tests |
|---------|------|-------|
| `tests/db-integration.test.ts` | Integración (testcontainers) | 21 |
| `f/internal/ai_agent/main.test.ts` | Unitarios | 49 |
| `f/internal/ai_agent/main.comprehensive.test.ts` | LLM real (con API keys) | 100 |
| `f/internal/cache/index.test.ts` | Unitarios | 7 |
| `f/gcal_reconcile/main.test.ts` | Unitarios | 5 |
| `f/booking_wizard/main.test.ts` | Unitarios | 7 |

---

## Reglas de Arquitectura (AGENTS.md v5.0)

1. **No `any`** — tipado estricto siempre
2. **No `as Type`** — usar type guards
3. **Errors as values** — `Promise<[Error | null, T | null]>`, no `throw`
4. **Inmutabilidad** — `Readonly<T>` en parámetros
5. **Cero promesas flotantes** — todo `await` o `Promise.allSettled`
6. **DB es source of truth** — GCal es solo copia
7. **Transaccionalidad** — `SELECT FOR UPDATE` para evitar double-booking
8. **Idempotencia** — toda operación de escritura acepta `idempotency_key`
9. **Switch exhaustivo** — `default: never` para acciones/intents

---

## Documentación de Best Practices (`docs/best-practices/`)

| Archivo | Tema |
|---------|------|
| `circuit-breaker-ts-postgres.md` | Circuit breaker en TS con persistencia PG |
| `distributed-locks-ts.md` | Redis Redlock + PG Advisory Locks |
| `postgresql-ts-windmill.md` | PostgreSQL con TypeScript en Windmill |
| `redis-ts-windmill.md` | Redis con TypeScript en Windmill |
| `telegram-windmill-ts.md` | Telegram Bot API + Windmill |
| `gcal-windmill-ts.md` | Google Calendar API + Service Account |
| `gmail-windmill-ts.md` | Gmail API + OAuth2 |
| `docker-bun-ts.md` | Docker multi-stage para Bun/TS |
| `typing-strategy.md` | Cuándo usar Record<string, unknown> vs interfaces |

---

## Pendientes / TODO

Ver `docs/todo.md` para la lista completa. Items principales:

- [ ] Tests E2E de flujos completos
- [ ] Canary rollout script de despliegue
- [ ] Semantic caching: integrar en más scripts (actualmente solo en LLM client)
- [ ] GCal webhook setup/renew scripts (tipar API responses)
- [ ] Telegram callback/menu (tipar return types)
- [ ] DB integration tests: agregar tests de concurrencia real (race conditions)

---

## Comandos Útiles

```bash
# Typecheck + lint + tests
npm run check:all

# Solo typecheck
npx tsc --noEmit -p tsconfig.strict.json

# Solo lint
npx eslint f/ --max-warnings 0

# Solo tests unitarios
npm run test

# Solo tests de integración DB (requiere Docker)
npm run test -- --run tests/db-integration.test.ts

# Solo tests de AI agent
npm run test -- --run f/internal/ai_agent/main.test.ts

# Solo tests LLM real (requiere API keys en .env.test)
npm run test -- --run f/internal/ai_agent/main.comprehensive.test.ts

# Sync a Windmill
wmill sync push --yes --base-url https://windmill.stax.ink --token <TOKEN>

# Git
./gp.sh "mensaje del commit"
```

---

## Instancias

| Servicio | URL |
|----------|-----|
| Windmill | https://windmill.stax.ink |
| GitHub | https://github.com/RogerDevCode/basic-booking-wm |

---

## Resumen de la Sesión (2026-04-04)

### Commits realizados (12)

1. `eea2c15` — AI agent fixes, Redis cache, GCal reconcile tests + 111/111 tests
2. `989b9a9` — Tipar booking_create + fix message_parser
3. `0592766` — Tipar booking_cancel
4. `763919e` — Tipar dlq_processor
5. `a9240bc` — Tipar gcal_reconcile
6. `aa76696` — Tipar provider_manage
7. `7235284` — Tipar reminder_cron
8. `9a17d45` — Tipar distributed_lock
9. `0dc085b` — Tipar circuit_breaker
10. `aed9250` — Tipar telegram_send
11. `df1f9ef` — Tipar patient_register
12. `c7dc64c` — Tipar booking_search
13. `c17d7ad` — Tipar provider_agenda
14. `aa1172c` — Tipar gcal_webhook_receiver
15. `50988d7` — Tipar reminder_config
16. `a78f16e` — Tipar gmail_send
17. `d1c61a9` — Documentar typing strategy
18. `8acdb0b` — DB integration tests (21 tests)

### Métricas de progreso

| Métrica | Antes | Después |
|---------|-------|---------|
| Tests passing | 182 (con 27 fallos) | 132/132 (100%) |
| ESLint warnings | 59 | 0 |
| Record<string, unknown> | 101 | 34 (24 legítimos) |
| require('postgres') | 9 | 0 |
| Docs Go → TS | 0 | 8 archivos |
| Semantic cache | No existía | Implementado + integrado |
| DB integration tests | 0 | 21 |
| GCal reconcile tests | 0 | 5 |
| Cache tests | 0 | 7 |
