# Session Context — Booking Titanium

> Última actualización: 2026-04-03
> Commit: `e5204e3` — docs: migrate Go best practices to TypeScript + fix all ESLint strict warnings (59→0)

---

## Estado Actual

| Check | Resultado |
|-------|-----------|
| TypeScript strict (`tsc --noEmit`) | ✅ 0 errores |
| ESLint strict (`eslint f/ --max-warnings 0`) | ✅ 0 errores, 0 warnings |
| Tests (`npm run test`) | 182 passing |
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
- **AI:** Groq (Llama 3.3 70B) + OpenAI fallback
- **Validación:** Zod 4.x

---

## Estructura de Scripts (`f/`)

### Core Booking
| Script | Ruta | Función |
|--------|------|---------|
| Availability Check | `f/availability_check/main.ts` | Slots libres por provider/fecha |
| Booking Create | `f/booking_create/main.ts` | Crear reserva con idempotencia |
| Booking Orchestrator | `f/booking_orchestrator/main.ts` | Routing de intents (AI → acción) |
| Booking Search | `f/booking_search/main.ts` | Búsqueda/filtro de reservas |
| Booking Wizard | `f/booking_wizard/main.ts` | Flujo multi-step Telegram |

### Integraciones
| Script | Ruta | Función |
|--------|------|---------|
| GCal Reconcile | `f/gcal_reconcile/main.ts` | Cron: reintentar syncs pendientes |
| GCal Sync | `f/gcal_sync/main.ts` | Sync booking → Google Calendar |
| GCal Webhook Receiver | `f/gcal_webhook_receiver/main.ts` | Push notifications GCal → DB |
| Gmail Send | `f/gmail_send/main.ts` | Envío de emails (confirmaciones) |
| Telegram Auto Register | `f/telegram_auto_register/main.ts` | Registro automático de usuarios |

### Infraestructura
| Script | Ruta | Función |
|--------|------|---------|
| Circuit Breaker | `f/circuit_breaker/main.ts` | Health monitor + aislamiento de fallos |
| Distributed Lock | `f/distributed_lock/main.ts` | Advisory locks (previene double-booking) |
| DLQ Processor | `f/dlq_processor/main.ts` | Dead Letter Queue handler |
| Health Check | `f/health_check/main.ts` | Verifica DB, GCal, Telegram |
| Reminder Config | `f/reminder_config/main.ts` | Config de recordatorios por paciente |
| Noshow Trigger | `f/noshow_trigger/main.ts` | Marca no-shows automáticos |
| RAG Query | `f/rag_query/main.ts` | Búsqueda en knowledge base |
| Provider Manage | `f/provider_manage/main.ts` | Gestión de providers |
| Patient Register | `f/patient_register/main.ts` | Registro de pacientes |
| Provider Agenda | `f/provider_agenda/main.ts` | Agenda del provider |
| Conversation Logger | `f/conversation_logger/main.ts` | Log de conversaciones |

### Web API
| Script | Ruta | Función |
|--------|------|---------|
| Web Booking API | `f/web_booking_api/main.ts` | CRUD reservas (create/cancel/reschedule) |
| Web Admin Users | `f/web_admin_users/main.ts` | CRUD usuarios (admin) |
| Web Admin Dashboard | `f/web_admin_dashboard/main.ts` | Dashboard admin |
| Web Auth Login | `f/web_auth_login/main.ts` | Login |
| Web Auth Register | `f/web_auth_register/main.ts` | Registro |
| Web Auth Me | `f/web_auth_me/main.ts` | Perfil actual |
| Web Auth Complete Profile | `f/web_auth_complete_profile/main.ts` | Completar perfil |
| Web Auth Change Role | `f/web_auth_change_role/main.ts` | Cambiar rol |
| Web Patient Bookings | `f/web_patient_bookings/main.ts` | Reservas del paciente |
| Web Patient Profile | `f/web_patient_profile/main.ts` | Perfil del paciente |
| Web Provider Dashboard | `f/web_provider_dashboard/main.ts` | Dashboard provider |
| Web Provider Notes | `f/web_provider_notes/main.ts` | Notas clínicas |
| Web Waitlist | `f/web_waitlist/main.ts` | Lista de espera |

### Internal
| Módulo | Ruta | Función |
|--------|------|---------|
| AI Agent | `f/internal/ai_agent/main.ts` | Detección de intents + LLM |
| AI Agent LLM Client | `f/internal/ai_agent/llm-client.ts` | Groq + OpenAI con retry |
| AI Agent Guardrails | `f/internal/ai_agent/guardrails.ts` | Validación de output LLM |
| Logger | `f/internal/logger/index.ts` | Logger estructurado |
| Retry | `f/internal/retry/index.ts` | Retry con backoff exponencial |

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

## Pendientes / TODO

Ver `docs/todo.md` para la lista completa. Items principales:

- [ ] Tests de integración con DB real
- [ ] Tests E2E de flujos completos
- [ ] 22 fallos de intentos de greeting en AI agent (78% pass rate actual)
- [ ] `require('postgres')` en 9 archivos (migrar a import)
- [ ] `Record<string, unknown>` en 38 ocurrencias (tipar con interfaces)
- [ ] Cron Job de reconciliación asíncrona (GCal pending_sync)
- [ ] Semantic caching con Redis
- [ ] Canary rollout script de despliegue

---

## Comandos Útiles

```bash
# Typecheck + lint + tests
npm run check:all

# Solo typecheck
npx tsc --noEmit -p tsconfig.strict.json

# Solo lint
npx eslint f/ --max-warnings 0

# Tests
npm run test

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

## Notas de la Última Sesión

- Migrados 8 docs de Go a TypeScript best practices
- Arreglados 59 ESLint warnings → 0
- Arreglados 4 TypeScript errors → 0
- Convertidos `if/else` chains a `switch` con `default: never` en 4 archivos web
- Eliminado `.eslintrc.json` legacy (usa `eslint.config.js` flat config)
- `wmill` declarado sin `| undefined` (siempre existe en runtime Windmill)
