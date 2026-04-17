# Monolith Split Trace

## CHECKPOINT TRACKER

| # | Feature dir | Archivos | Fase 1 | Fase 2 | Fase 3 | Fase 4 | Estado |
|---|-------------|----------|---------|--------|--------|--------|--------|
| 1 | f/internal/ai_agent/ | types, constants, llm-client, prompt-builder, rag-context, tfidf-classifier, guardrails, tracing, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 2 | f/internal/booking_fsm/ | types, data-specialties, data-doctors, data-slots, machine, responses, index | ✅ | ✅ | ✅ | ✅ | DONE |
| 3 | f/internal/cache/ | index | ✅ | ✅ | ✅ | ✅ | DONE |
| 4 | f/internal/config/ | index | ✅ | ✅ | ✅ | ✅ | DONE |
| 5 | f/internal/conversation-state/ | index | ✅ | ✅ | ✅ | ✅ | DONE |
| 6 | f/internal/conversation_get/ | types, services, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 7 | f/internal/conversation_update/ | types, services, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 8 | f/internal/crypto/ | index | ✅ | ✅ | ✅ | ✅ | DONE |
| 9 | f/internal/date-resolver/ | index | ✅ | ✅ | ✅ | ✅ | DONE |
| 10 | f/internal/db/ | client | ✅ | ✅ | ✅ | ✅ | DONE |
| 11 | f/internal/db-types/ | index | ✅ | ✅ | ✅ | ✅ | DONE |
| 12 | f/internal/fetch-retry/ | index | ✅ | ✅ | ✅ | ✅ | DONE |
| 13 | f/internal/gcal_utils/ | buildGCalEvent, oauth | ✅ | ✅ | ✅ | ✅ | DONE |
| 14 | f/internal/logger/ | index | ✅ | ✅ | ✅ | ✅ | DONE |
| 15 | f/internal/message_parser/ | types, services, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 16 | f/internal/result/ | index (SHARED) | ✅ | ✅ | ✅ | ✅ | DONE |
| 17 | f/internal/retry/ | index | ✅ | ✅ | ✅ | ✅ | DONE |
| 18 | f/internal/scheduling-engine/ | index | ✅ | ✅ | ✅ | ✅ | DONE |
| 19 | f/internal/state-machine/ | index | ✅ | ✅ | ✅ | ✅ | DONE |
| 20 | f/internal/telegram_bubble/ | types, services, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 21 | f/internal/telegram_router/ | types, services, booking-wizard, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 22 | f/internal/tenant-context/ | index | ✅ | ✅ | ✅ | ✅ | DONE |
| 23 | f/admin_honorifics/ | types, services, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 24 | f/availability_check/ | types, services, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 25 | f/booking_create/ | types, services, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 26 | f/conversation_logger/ | types, services, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 27 | f/web_auth_me/ | types, services, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 28 | f/health_check/ | types, services, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 29 | f/telegram_menu/ | types, services, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 30 | f/gcal_webhook_renew/ | types, services, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 31 | f/telegram_auto_register/ | types, services, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 32 | f/web_admin_dashboard/ | types, services, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 33 | f/web_admin_regions/ | types, services, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 34 | f/gcal_webhook_setup/ | types, services, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 35 | f/provider_agenda/ | types, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 36 | f/booking_search/ | types, main | ✅ | ✅ | ✅ | ✅ | DONE |
| 37 | f/web_provider_dashboard/ | types, main | ✅ | ✅ | ✅ | ✅ | DONE |

## Pendientes (23 archivos)
- f/booking_orchestrator/main.ts (498 líneas)
- f/booking_wizard/main.ts (498 líneas)
- f/openrouter_benchmark/main.ts (486 líneas)
- f/telegram_callback/main.ts (423 líneas)
- f/gemini_test/main.ts (405 líneas)
- f/reminder_cron/main.ts (523 líneas)
- f/telegram_gateway/main.ts (360 líneas)
- f/distributed_lock/main.ts (337 líneas)
- f/gcal_sync/main.ts (334 líneas)
- f/provider_notes/main.ts (331 líneas)
- f/provider_dashboard/main.ts (356 líneas)
- f/booking_reschedule/main.ts (285 líneas)
- f/noshow_trigger/main.ts (267 líneas)
- f/reminder_config/main.ts (265 líneas)
- f/circuit_breaker/main.ts (289 líneas)
- f/telegram_callback/main.ts (423 líneas)
- Y más...

## Estado Final
- TypeScript strict: PASS
- Commit: 0b6a665
- Progreso: 30/53 features (57%)
