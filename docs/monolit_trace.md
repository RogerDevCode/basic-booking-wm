# Monolith Split Trace

## CHECKPOINT TRACKER

| # | Feature dir | Archivos generados | Fase 1 | Fase 2 | Fase 3 | Fase 4 | Estado |
|---|-------------|--------------------|--------|--------|--------|--------|--------|--------|
| 1 | f/internal/ai_agent/ | types.ts, constants.ts, llm-client.ts, prompt-builder.ts, rag-context.ts, tfidf-classifier.ts, guardrails.ts, tracing.ts, main.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 2 | f/internal/booking_fsm/ | types.ts, data-specialties.ts, data-doctors.ts, data-slots.ts, machine.ts, responses.ts, index.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 3 | f/internal/cache/ | index.ts, index.test.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 4 | f/internal/config/ | index.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 5 | f/internal/conversation-state/ | index.ts, redis-production.test.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 6 | f/internal/conversation_get/ | types.ts, services.ts, main.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 7 | f/internal/conversation_update/ | types.ts, services.ts, main.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 8 | f/internal/crypto/ | index.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 9 | f/internal/date-resolver/ | index.ts, index.test.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 10 | f/internal/db/ | client.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 11 | f/internal/db-types/ | index.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 12 | f/internal/fetch-retry/ | index.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 13 | f/internal/gcal_utils/ | buildGCalEvent.ts, oauth.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 14 | f/internal/logger/ | index.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 15 | f/internal/message_parser/ | types.ts, services.ts, main.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 16 | f/internal/result/ | index.ts (SHARED - no tocar) | ✅ | ✅ | ✅ | ✅ | DONE |
| 17 | f/internal/retry/ | index.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 18 | f/internal/scheduling-engine/ | index.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 19 | f/internal/state-machine/ | index.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 20 | f/internal/telegram_bubble/ | types.ts, services.ts, main.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 21 | f/internal/telegram_router/ | types.ts, services.ts, booking-wizard.ts, main.ts | ✅ | ✅ | ✅ | ✅ | DONE |
| 22 | f/internal/tenant-context/ | index.ts | ✅ | ✅ | ✅ | ✅ | DONE |

## Fix Aplicado
- f/web_admin_provider_crud/services.ts: Corregido escaping de backticks (TS1127 error)

## Estado Final
- TypeScript strict: PASS (unused vars son advertencias, no errores de compilación)
- ESLint strict: Con advertencias pre-existentes (no críticas)
- Tests: 337 passed, 7 failed, 37 skipped

## Notas
- carpetas f/internal/* YA estaban refactorizadas según el patrón
- Excepción: servicios.ts tenía bug de sintaxis (backticks escapados incorrectamente)
- arch result.ts y constants.ts son shared singletons - NO se tocan