# Feature Map — f/

> Manual index. Update when adding/removing feature folders.
> Rule: every `f/{feature}/` has `main.ts` (entrypoint) + `types.ts` + optional service/repository files.

## Core Booking Flow

| Folder | Purpose | Key files |
|--------|---------|-----------|
| `booking_create/` | Atomic booking: validate → lock provider → check overlap → insert → gcal_sync | main.ts, validateBookingInput.ts, executeBooking.ts |
| `booking_cancel/` | FSM cancel: validateTransition → DB status update → GCal delete | main.ts, types.ts |
| `booking_reschedule/` | FSM reschedule + GCal event update | main.ts, executeReschedule.ts |
| `booking_orchestrator/` | NLU intent router → handler dispatch | main.ts, types.ts |
| `booking_wizard/` | Telegram inline-keyboard FSM (multi-step booking) | main.ts, WizardRouter.ts, handlers/ |
| `booking_search/` | Search bookings by filters | main.ts |
| `availability_check/` | Free slot calculation from provider schedules | main.ts |

## Telegram Layer

| Folder | Purpose |
|--------|---------|
| `telegram_callback/` | Webhook entry: routes to booking_orchestrator or wizard |
| `telegram_gateway/` | Outbound Telegram messages (send/edit) |
| `telegram_send/` | Low-level Telegram Bot API wrapper (sendMessage, editMessageText, answerCallbackQuery) |
| `telegram_menu/` | Main menu keyboard builder |
| `telegram_auto_register/` | Auto-creates client record on first Telegram contact |
| `telegram_debug/` | Debug helpers for Telegram flows |
| `internal/telegram_router/` | Priority-based message routing (Priority 1=wizard callback, 1b=wizard text, 2=system, 3=slash, 4=menu, 5=AI) |

## Google Calendar

| Folder | Purpose |
|--------|---------|
| `gcal_sync/` | Real-time sync (fire-and-forget, called after booking mutations) |
| `gcal_reconcile/` | Cron job — retries `pending_gcal` rows with exponential backoff |
| `gcal_webhook_receiver/` | Receives GCal push notifications |
| `gcal_webhook_renew/` | Renews GCal webhook subscriptions |
| `gcal_webhook_setup/` | Initial GCal webhook registration |

## Scheduling & Reminders

| Folder | Purpose |
|--------|---------|
| `reminder_cron/` | Sends 24h/2h/30min reminders before appointments |
| `reminder_config/` | Stores user reminder preferences |
| `noshow_trigger/` | Marks bookings as no_presentado after missed appointment |

## Web APIs

| Folder | Purpose |
|--------|---------|
| `web_booking_api/` | REST CRUD for bookings |
| `web_provider_profile/` | Provider self-service profile (get/update/change_password) |
| `web_patient_profile/` | Patient profile CRUD (find_or_create + update) |
| `web_patient_bookings/` | Patient booking list with status filters |
| `web_provider_notes/` | Encrypted clinical notes (AES via decryptContent) |
| `web_waitlist/` | Waitlist management |
| `web_admin_users/` | Admin user management |
| `web_admin_regions/` | Admin region/commune CRUD |
| `web_admin_provider_crud/` | Admin provider management |
| `admin_honorifics/` | Honorific titles catalog |
| `provider_agenda/` | Provider daily agenda view |
| `provider_dashboard/` | Provider stats dashboard |
| `provider_manage/` | Provider enable/disable |
| `patient_register/` | New patient registration |
| `auth_provider/` | Provider authentication (password verify + JWT) |

## AI & NLU

| Folder | Purpose |
|--------|---------|
| `nlu/` | Intent extraction via AI model; vocabulary in `constants.ts` |
| `rag_query/` | Semantic/keyword search over `knowledge_base` table |
| `conversation_logger/` | Persists conversation turns to DB |

## Infrastructure

| Folder | Purpose |
|--------|---------|
| `health_check/` | System health endpoint |
| `circuit_breaker/` | Circuit breaker pattern for external calls |
| `distributed_lock/` | Postgres advisory lock wrapper |
| `dlq_processor/` | Dead letter queue retry processor |
| `gmail_send/` | Email notifications via nodemailer |
| `flows/` | Windmill flow YAMLs (telegram_webhook__flow, booking_orchestrator__flow) |

## Shared Internal (`internal/`)

| Path | Exports | Purpose |
|------|---------|---------|
| `internal/result.ts` | `type Result<T>` | `[Error\|null, T\|null]` — used everywhere |
| `internal/tenant-context/` | `withTenantContext(sql, tenantId, fn)` | RLS isolation wrapper for ALL DB ops |
| `internal/db/client.ts` | `createDbClient({url})` | Postgres connection factory |
| `internal/booking_fsm/` | `BookingState`, `DraftBooking`, `transition()`, `emptyDraft()`, `BookingStateSchema` | FSM types + transitions |
| `internal/booking_fsm/data-slots.ts` | `fetchDataForState()` | Fetches DB data for each FSM step |
| `internal/booking_fsm/responses.ts` | `buildResponseForState()` | Text + keyboard for each FSM step |
| `internal/conversation-state/` | `updateConversationState()`, `ConversationState` | Redis state persistence (30min TTL) |
| `internal/telegram_router/` | `main()` → `RouterOutput` | See Telegram Layer above |
| `internal/fetch-retry/` | `fetchWithRetry()` | HTTP retry with exponential backoff |
| `internal/crypto.ts` | `hashPassword()`, `verifyPassword()`, `validatePasswordPolicy()` | Password utilities |
| `internal/message_parser/` | `parseMessage()` | Telegram message normalization |
| `internal/ai_agent/` | `main()` | AI intent detection wrapper |
