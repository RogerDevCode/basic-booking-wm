# Codebase Index
_git:59c68354 — 2026-04-26T17:06Z_

> Read this file BEFORE exploring the repository.

## Module Map

### `f/admin_honorifics/_honorifics_logic.py`
- 🔧 `fn` `map_row` (L6)
- ⚡ `async_fn` `list_honorifics` (L17)
- ⚡ `async_fn` `create_honorific` (L26)
- ⚡ `async_fn` `update_honorific` (L48)
- ⚡ `async_fn` `delete_honorific` (L96)

### `f/admin_honorifics/_honorifics_models.py`
- 📦 `class` `HonorificRow` (L4)
- 📦 `class` `InputSchema` (L13)

### `f/admin_honorifics/main.py`
- ⚡ `async_fn` `operation` (L36)
- 🔧 `fn` `main` (L67)

### `f/auth_provider/_auth_logic.py`
- 🔧 `fn` `generate_readable_password` (L11)
- ⚡ `async_fn` `admin_generate_temp_password` (L16)
- ⚡ `async_fn` `provider_change_password` (L50)
- ⚡ `async_fn` `provider_verify` (L85)

### `f/auth_provider/_auth_models.py`
- 📦 `class` `TempPasswordResult` (L4)
- 📦 `class` `PasswordChangeResult` (L11)
- 📦 `class` `VerifyResult` (L15)
- 📦 `class` `InputSchema` (L20)

### `f/auth_provider/main.py`
- ⚡ `async_fn` `operation` (L34)
- 🔧 `fn` `main` (L53)

### `f/availability_check/_availability_logic.py`
- ⚡ `async_fn` `get_provider_service_id` (L5)
- ⚡ `async_fn` `get_provider` (L19)

### `f/availability_check/_availability_models.py`
- 📦 `class` `InputSchema` (L5)
- 📦 `class` `AvailabilityResult` (L15)
- 📦 `class` `ProviderRow` (L26)

### `f/availability_check/main.py`
- ⚡ `async_fn` `main_async` (L24)
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L74)

### `f/booking_cancel/_booking_cancel_models.py`
- 📦 `class` `CancelBookingInput` (L5)
- 📦 `class` `CancelResult` (L13)
- 📦 `class` `BookingLookup` (L20)
- 📦 `class` `UpdatedBooking` (L28)

### `f/booking_cancel/_booking_cancel_repository.py`
- 📦 `class` `BookingCancelRepository` (L7)
- ⚡ `async_fn` `fetch_booking` (L8)
- ⚡ `async_fn` `lock_booking` (L9)
- ⚡ `async_fn` `update_booking_status` (L10)
- ⚡ `async_fn` `insert_audit_trail` (L11)
- ⚡ `async_fn` `trigger_gcal_sync` (L12)
- 📦 `class` `PostgresBookingCancelRepository` (L14)
- ⚡ `async_fn` `fetch_booking` (L18)
- ⚡ `async_fn` `lock_booking` (L40)
- ⚡ `async_fn` `update_booking_status` (L53)
- ⚡ `async_fn` `insert_audit_trail` (L78)
- ⚡ `async_fn` `trigger_gcal_sync` (L106)

### `f/booking_cancel/_cancel_booking_logic.py`
- 🔧 `fn` `authorize_actor` (L6)
- ⚡ `async_fn` `execute_cancel_booking` (L18)

### `f/booking_cancel/main.py`
- ⚡ `async_fn` `main_async` (L25)
- ⚡ `async_fn` `operation` (L61)
- 🔧 `fn` `main` (L90)

### `f/booking_create/_booking_create_models.py`
- 📦 `class` `InputSchema` (L5)
- 🔧 `fn` `parse_datetime` (L19)
- 📦 `class` `BookingCreated` (L24)
- 📦 `class` `ClientContext` (L33)
- 📦 `class` `ProviderContext` (L37)
- 📦 `class` `ServiceContext` (L42)
- 📦 `class` `BookingContext` (L47)

### `f/booking_create/_booking_create_repository.py`
- 📦 `class` `BookingCreateRepository` (L13)
- ⚡ `async_fn` `get_client_context` (L14)
- ⚡ `async_fn` `get_provider_context` (L15)
- ⚡ `async_fn` `get_service_context` (L16)
- ⚡ `async_fn` `is_provider_blocked` (L17)
- ⚡ `async_fn` `is_provider_scheduled` (L18)
- ⚡ `async_fn` `has_overlapping_booking` (L19)
- ⚡ `async_fn` `insert_booking` (L20)
- 📦 `class` `PostgresBookingCreateRepository` (L30)
- ⚡ `async_fn` `get_client_context` (L34)
- ⚡ `async_fn` `get_provider_context` (L43)
- ⚡ `async_fn` `get_service_context` (L61)
- ⚡ `async_fn` `is_provider_blocked` (L81)
- ⚡ `async_fn` `is_provider_scheduled` (L95)
- ⚡ `async_fn` `has_overlapping_booking` (L109)
- ⚡ `async_fn` `insert_booking` (L125)

### `f/booking_create/_create_booking_logic.py`
- ⚡ `async_fn` `fetch_booking_context` (L8)
- ⚡ `async_fn` `check_availability` (L30)
- ⚡ `async_fn` `persist_booking` (L61)
- ⚡ `async_fn` `execute_create_booking` (L85)

### `f/booking_create/main.py`
- ⚡ `async_fn` `main_async` (L24)
- ⚡ `async_fn` `operation` (L44)
- 🔧 `fn` `main` (L77)

### `f/booking_orchestrator/_context_resolver.py`
- ⚡ `async_fn` `resolve_context` (L18)

### `f/booking_orchestrator/_get_entity.py`
- 🔧 `fn` `get_entity` (L14)

### `f/booking_orchestrator/_intent_router.py`
- 🔧 `fn` `normalize_intent` (L31)

### `f/booking_orchestrator/_orchestrator_models.py`
- 📦 `class` `OrchestratorInput` (L35)
- 📦 `class` `OrchestratorResult` (L52)
- 📦 `class` `ResolvedContext` (L62)
- 📦 `class` `AvailabilitySlot` (L70)
- 📦 `class` `AvailabilityData` (L74)
- 📦 `class` `BookingRow` (L80)

### `f/booking_orchestrator/handlers/_cancel.py`
- ⚡ `async_fn` `handle_cancel_booking` (L19)

### `f/booking_orchestrator/handlers/_create.py`
- ⚡ `async_fn` `handle_create_booking` (L18)

### `f/booking_orchestrator/handlers/_get_my_bookings.py`
- ⚡ `async_fn` `handle_get_my_bookings` (L19)
- ⚡ `async_fn` `operation` (L37)

### `f/booking_orchestrator/handlers/_list_available.py`
- ⚡ `async_fn` `handle_list_available` (L18)

### `f/booking_orchestrator/handlers/_reschedule.py`
- ⚡ `async_fn` `handle_reschedule` (L19)

### `f/booking_orchestrator/main.py`
- 🔧 `fn` `main` (L83)

### `f/booking_reschedule/_reschedule_logic.py`
- 🔧 `fn` `authorize` (L7)
- ⚡ `async_fn` `execute_reschedule_logic` (L16)

### `f/booking_reschedule/_reschedule_models.py`
- 📦 `class` `RescheduleInput` (L6)
- 🔧 `fn` `parse_datetime` (L19)
- 📦 `class` `RescheduleResult` (L24)
- 📦 `class` `RescheduleWriteResult` (L33)
- 📦 `class` `BookingRow` (L41)
- 📦 `class` `ServiceRow` (L51)

### `f/booking_reschedule/_reschedule_repository.py`
- 📦 `class` `RescheduleRepository` (L8)
- ⚡ `async_fn` `fetch_booking` (L9)
- ⚡ `async_fn` `fetch_service` (L10)
- ⚡ `async_fn` `check_overlap` (L11)
- ⚡ `async_fn` `execute_reschedule` (L12)
- 📦 `class` `PostgresRescheduleRepository` (L14)
- ⚡ `async_fn` `fetch_booking` (L18)
- ⚡ `async_fn` `fetch_service` (L41)
- ⚡ `async_fn` `check_overlap` (L58)
- ⚡ `async_fn` `execute_reschedule` (L76)

### `f/booking_reschedule/main.py`
- ⚡ `async_fn` `main_async` (L26)
- ⚡ `async_fn` `operation` (L69)
- 🔧 `fn` `main` (L103)

### `f/booking_search/_search_logic.py`
- ⚡ `async_fn` `execute_search` (L6)

### `f/booking_search/_search_models.py`
- 📦 `class` `SearchInput` (L4)
- 📦 `class` `BookingSearchRow` (L16)
- 📦 `class` `BookingSearchResult` (L27)

### `f/booking_search/main.py`
- 🔧 `fn` `main` (L59)

### `f/booking_wizard/_wizard_logic.py`
- 📦 `class` `DateUtils` (L10)
- 🔧 `fn` `format_es` (L12)
- 🔧 `fn` `get_week_dates` (L19)
- 🔧 `fn` `generate_time_slots` (L35)
- 📦 `class` `WizardUI` (L42)
- 🔧 `fn` `build_date_selection` (L44)
- 🔧 `fn` `build_time_selection` (L64)
- 🔧 `fn` `build_confirmation` (L79)
- 📦 `class` `WizardRepository` (L88)
- ⚡ `async_fn` `get_service_duration` (L92)
- ⚡ `async_fn` `get_available_slots` (L97)
- ⚡ `async_fn` `get_names` (L117)
- ⚡ `async_fn` `create_booking` (L123)

### `f/booking_wizard/_wizard_models.py`
- 📦 `class` `WizardState` (L5)
- 📦 `class` `StepView` (L14)
- 📦 `class` `InputSchema` (L21)
- 📦 `class` `WizardResult` (L31)

### `f/booking_wizard/main.py`
- ⚡ `async_fn` `operation` (L40)
- 🔧 `fn` `main` (L144)

### `f/circuit_breaker/_circuit_logic.py`
- ⚡ `async_fn` `get_state` (L6)
- ⚡ `async_fn` `init_service` (L38)

### `f/circuit_breaker/_circuit_models.py`
- 📦 `class` `CircuitState` (L4)
- 📦 `class` `CircuitBreakerResult` (L18)
- 📦 `class` `InputSchema` (L27)

### `f/circuit_breaker/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L103)

### `f/conversation_logger/_logger_logic.py`
- ⚡ `async_fn` `persist_log` (L6)

### `f/conversation_logger/_logger_models.py`
- 📦 `class` `LogResult` (L4)
- 📦 `class` `InputSchema` (L7)

### `f/conversation_logger/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L44)

### `f/distributed_lock/_lock_logic.py`
- 🔧 `fn` `map_row_to_lock_info` (L7)
- ⚡ `async_fn` `acquire_lock` (L18)
- ⚡ `async_fn` `release_lock` (L59)
- ⚡ `async_fn` `check_lock` (L73)
- ⚡ `async_fn` `cleanup_locks` (L89)

### `f/distributed_lock/_lock_models.py`
- 📦 `class` `LockInfo` (L4)
- 📦 `class` `LockResult` (L13)
- 📦 `class` `LockRow` (L23)
- 📦 `class` `InputSchema` (L32)

### `f/distributed_lock/main.py`
- ⚡ `async_fn` `operation` (L34)
- 🔧 `fn` `main` (L55)

### `f/dlq_processor/_dlq_logic.py`
- 🔧 `fn` `map_row_to_dlq_entry` (L7)
- ⚡ `async_fn` `list_dlq` (L26)
- ⚡ `async_fn` `retry_dlq` (L40)
- ⚡ `async_fn` `resolve_dlq` (L72)
- ⚡ `async_fn` `discard_dlq` (L91)
- ⚡ `async_fn` `get_dlq_status_stats` (L107)

### `f/dlq_processor/_dlq_models.py`
- 📦 `class` `DLQEntry` (L4)
- 📦 `class` `DLQListResult` (L21)
- 📦 `class` `InputSchema` (L25)

### `f/dlq_processor/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L59)

### `f/gcal_reconcile/_reconcile_logic.py`
- ⚡ `async_fn` `retry_with_backoff` (L13)
- ⚡ `async_fn` `call_gcal_api` (L33)
- ⚡ `async_fn` `sync_booking_to_gcal` (L66)
- ⚡ `async_fn` `sync_op` (L89)
- ⚡ `async_fn` `sync_op_cli` (L104)

### `f/gcal_reconcile/_reconcile_models.py`
- 📦 `class` `InputSchema` (L4)
- 📦 `class` `ReconcileResult` (L12)
- 📦 `class` `BookingRow` (L20)
- 📦 `class` `SyncResult` (L34)

### `f/gcal_reconcile/main.py`
- ⚡ `async_fn` `provider_batch` (L40)
- 🔧 `fn` `main` (L128)

### `f/gcal_sync/_gcal_api_adapter.py`
- ⚡ `async_fn` `fetch_booking_details` (L9)
- ⚡ `async_fn` `operation` (L10)
- ⚡ `async_fn` `call_gcal_api` (L57)

### `f/gcal_sync/_gcal_sync_models.py`
- 📦 `class` `GCalSyncResult` (L5)
- 📦 `class` `BookingDetails` (L13)
- 📦 `class` `InputSchema` (L24)

### `f/gcal_sync/_sync_event_logic.py`
- ⚡ `async_fn` `sync_event` (L7)

### `f/gcal_sync/_update_sync_status.py`
- ⚡ `async_fn` `update_booking_sync_status` (L4)
- ⚡ `async_fn` `operation` (L15)

### `f/gcal_sync/main.py`
- 🔧 `fn` `main` (L90)

### `f/gmail_send/_gmail_logic.py`
- 🔧 `fn` `safe_string` (L9)
- 🔧 `fn` `build_email_content` (L14)
- ⚡ `async_fn` `send_with_retry` (L112)
- 🔧 `fn` `do_send` (L125)

### `f/gmail_send/_gmail_models.py`
- 📦 `class` `ActionLink` (L4)
- 📦 `class` `GmailSendData` (L10)
- 📦 `class` `InputSchema` (L17)

### `f/gmail_send/main.py`
- 🔧 `fn` `main` (L81)

### `f/health_check/_health_logic.py`
- ⚡ `async_fn` `check_database` (L9)
- ⚡ `async_fn` `check_gcal` (L21)
- ⚡ `async_fn` `check_telegram` (L40)
- 🔧 `fn` `check_gmail` (L56)

### `f/health_check/_health_models.py`
- 📦 `class` `ComponentStatus` (L4)
- 📦 `class` `HealthResult` (L10)
- 📦 `class` `InputSchema` (L15)

### `f/health_check/main.py`
- 🔧 `fn` `main` (L66)

### `f/internal/_config.py`
- 🔧 `fn` `get_env` (L55)
- 🔧 `fn` `require_env` (L58)
- 🔧 `fn` `require_database_url` (L64)

### `f/internal/_crypto.py`
- 🔧 `fn` `hash_password` (L16)
- 🔧 `fn` `verify_password` (L25)
- 📦 `class` `PasswordPolicyResult` (L41)
- 🔧 `fn` `validate_password_policy` (L45)
- 🔧 `fn` `get_encryption_key` (L67)
- 🔧 `fn` `encrypt_data` (L74)
- 🔧 `fn` `decrypt_data` (L83)

### `f/internal/_date_resolver.py`
- 📦 `class` `ResolveDateOpts` (L18)
- 🔧 `fn` `resolve_date` (L75)
- 🔧 `fn` `resolve_time` (L133)
- 🔧 `fn` `today_ymd` (L159)

### `f/internal/_db_client.py`
- ⚡ `async_fn` `create_db_client` (L33)

### `f/internal/_result.py`
- 🔧 `fn` `ok` (L13)
- 🔧 `fn` `fail` (L17)
- 🔧 `fn` `is_ok` (L22)
- 🔧 `fn` `is_fail` (L26)
- ⚡ `async_fn` `wrap` (L30)
- 📦 `class` `DBClient` (L41)
- ⚡ `async_fn` `fetch` (L42)
- ⚡ `async_fn` `fetchrow` (L43)
- ⚡ `async_fn` `fetchval` (L44)
- ⚡ `async_fn` `execute` (L45)
- ⚡ `async_fn` `with_tenant_context` (L47)
- ⚡ `async_fn` `with_admin_context` (L81)

### `f/internal/_state_machine.py`
- 🔧 `fn` `validate_transition` (L39)

### `f/internal/_wmill_adapter.py`
- 🔧 `fn` `get_variable` (L8)
- 🔧 `fn` `get_env` (L24)
- 🔧 `fn` `log` (L28)
- 🔧 `fn` `run_script` (L47)

### `f/internal/ai_agent/_ai_agent_logic.py`
- 🔧 `fn` `adjust_intent_with_context` (L19)
- 🔧 `fn` `extract_entities` (L68)
- 🔧 `fn` `detect_context` (L138)
- 🔧 `fn` `determine_escalation_level` (L166)
- 🔧 `fn` `generate_ai_response` (L181)
- 🔧 `fn` `detect_social` (L196)

### `f/internal/ai_agent/_ai_agent_models.py`
- 📦 `class` `ConversationState` (L10)
- 📦 `class` `UserProfile` (L23)
- 📦 `class` `AIAgentInput` (L29)
- 📦 `class` `EntityMap` (L39)
- 📦 `class` `AvailabilityContext` (L53)
- 📦 `class` `ContextAdjustment` (L64)
- 📦 `class` `IntentResult` (L79)
- 📦 `class` `LLMOutputEntities` (L99)
- 📦 `class` `LLMOutput` (L106)

### `f/internal/ai_agent/_constants.py`
- 📦 `class` `IntentsStruct` (L14)
- 📦 `class` `KeywordDef` (L70)
- 📦 `class` `EscalationThresholdsStruct` (L203)
- 📦 `class` `RuleConfidenceStruct` (L216)
- 📦 `class` `SocialConfidenceStruct` (L233)
- 📦 `class` `ConfidenceBoundariesStruct` (L250)

### `f/internal/ai_agent/_guardrails.py`
- 📦 `class` `GuardrailPass` (L6)
- 📦 `class` `GuardrailBlocked` (L9)
- 🔧 `fn` `validate_input` (L35)
- 🔧 `fn` `validate_output` (L52)
- 🔧 `fn` `sanitize_json_response` (L65)
- 🔧 `fn` `verify_urgency` (L78)

### `f/internal/ai_agent/_llm_client.py`
- 📦 `class` `ChatMessage` (L15)
- 📦 `class` `LLMResponse` (L19)
- ⚡ `async_fn` `call_llm` (L27)

### `f/internal/ai_agent/_prompt_builder.py`
- 🔧 `fn` `build_system_prompt` (L73)
- 🔧 `fn` `build_user_message` (L88)

### `f/internal/ai_agent/_rag_context.py`
- 📦 `class` `RAGResult` (L5)
- ⚡ `async_fn` `build_rag_context` (L10)
- ⚡ `async_fn` `get_rag_context` (L55)

### `f/internal/ai_agent/_tfidf_classifier.py`
- 🔧 `fn` `normalize` (L100)
- 🔧 `fn` `compute_tf` (L119)
- 🔧 `fn` `compute_idf` (L126)
- 🔧 `fn` `cosine_similarity` (L135)
- 📦 `class` `TfIdfModel` (L149)
- 🔧 `fn` `get_model` (L160)
- 📦 `class` `Score` (L166)
- 📦 `class` `TfIdfResult` (L170)
- 🔧 `fn` `classify_intent` (L175)

### `f/internal/ai_agent/main.py`
- 🔧 `fn` `main` (L124)

### `f/internal/apply_fix_migration.py`
- 🔧 `fn` `main` (L22)

### `f/internal/booking_fsm/_fsm_machine.py`
- 🔧 `fn` `parse_action` (L18)
- 🔧 `fn` `parse_callback_data` (L39)
- 🔧 `fn` `apply_transition` (L51)
- 🔧 `fn` `flow_step_from_state` (L267)

### `f/internal/booking_fsm/_fsm_models.py`
- 📦 `class` `NamedItem` (L21)
- 📦 `class` `TimeSlotItem` (L25)
- 📦 `class` `DraftCore` (L36)
- 📦 `class` `DraftBooking` (L47)
- 🔧 `fn` `empty_draft` (L54)
- 📦 `class` `IdleState` (L61)
- 📦 `class` `SelectingSpecialtyState` (L64)
- 📦 `class` `SelectingDoctorState` (L69)
- 📦 `class` `SelectingTimeState` (L76)
- 📦 `class` `ConfirmingState` (L85)
- 📦 `class` `CompletedState` (L93)
- 📦 `class` `BookingStateRoot` (L110)
- 📦 `class` `SelectAction` (L117)
- 📦 `class` `SelectDateAction` (L121)
- 📦 `class` `BackAction` (L125)
- 📦 `class` `CancelAction` (L128)
- 📦 `class` `ConfirmYesAction` (L131)
- 📦 `class` `ConfirmNoAction` (L134)
- 📦 `class` `TransitionOutcome` (L153)

### `f/internal/booking_fsm/_fsm_responses.py`
- 📦 `class` `InlineButton` (L7)
- 🔧 `fn` `build_header` (L11)
- 🔧 `fn` `build_specialty_prompt` (L14)
- 🔧 `fn` `build_doctors_prompt` (L18)
- 🔧 `fn` `build_slots_prompt` (L22)
- 🔧 `fn` `build_confirmation_prompt` (L26)
- 🔧 `fn` `build_loading_doctors_prompt` (L30)
- 🔧 `fn` `build_loading_slots_prompt` (L33)
- 🔧 `fn` `chunk_buttons` (L40)
- 🔧 `fn` `build_specialty_keyboard` (L43)
- 🔧 `fn` `build_doctor_keyboard` (L48)
- 🔧 `fn` `build_time_slot_keyboard` (L54)
- 🔧 `fn` `build_confirmation_keyboard` (L60)

### `f/internal/debug_db.py`
- 🔧 `fn` `main` (L20)

### `f/internal/debug_db_final.py`
- 🔧 `fn` `main` (L15)

### `f/internal/gcal_utils/_gcal_logic.py`
- 🔧 `fn` `build_gcal_event` (L5)

### `f/internal/gcal_utils/_gcal_models.py`
- 📦 `class` `BookingEventData` (L3)
- 📦 `class` `GCalTime` (L11)
- 📦 `class` `GCalReminderOverride` (L15)
- 📦 `class` `GCalReminders` (L19)
- 📦 `class` `GoogleCalendarEvent` (L23)
- 📦 `class` `TokenInfo` (L31)

### `f/internal/gcal_utils/_oauth_logic.py`
- 📦 `class` `TokenResponse` (L7)
- ⚡ `async_fn` `get_valid_access_token` (L15)
- ⚡ `async_fn` `refresh_access_token` (L54)
- ⚡ `async_fn` `persist_new_token` (L84)

### `f/internal/scheduling_engine/_scheduling_logic.py`
- 🔧 `fn` `time_to_minutes` (L10)
- 🔧 `fn` `generate_slots_for_rule` (L17)
- ⚡ `async_fn` `get_availability` (L77)
- ⚡ `async_fn` `get_availability_range` (L200)
- ⚡ `async_fn` `validate_override` (L232)

### `f/internal/scheduling_engine/_scheduling_models.py`
- 📦 `class` `TimeSlot` (L4)
- 📦 `class` `AvailabilityQuery` (L9)
- 📦 `class` `AvailabilityResult` (L14)
- 📦 `class` `ScheduleOverrideRow` (L24)
- 📦 `class` `ProviderScheduleRow` (L33)
- 📦 `class` `BookingTimeRow` (L40)
- 📦 `class` `ServiceRow` (L44)
- 📦 `class` `AffectedBooking` (L49)
- 📦 `class` `OverrideValidation` (L54)

### `f/internal/test_var.py`
- 🔧 `fn` `main` (L2)

### `f/nlu/_tfidf_classifier.py`
- 📦 `class` `TfIdfResult` (L190)
- 🔧 `fn` `classify_intent` (L195)

### `f/nlu/main.py`
- 📦 `class` `ExtractedIntent` (L17)
- 🔧 `fn` `main` (L60)

### `f/noshow_trigger/_noshow_logic.py`
- 📦 `class` `BookingRepository` (L5)
- ⚡ `async_fn` `find_expired_confirmed` (L9)
- ⚡ `async_fn` `mark_as_no_show` (L25)

### `f/noshow_trigger/_noshow_models.py`
- 📦 `class` `NoShowStats` (L4)
- 📦 `class` `InputSchema` (L10)
- 📦 `class` `ProviderRow` (L16)

### `f/noshow_trigger/main.py`
- ⚡ `async_fn` `provider_batch` (L39)
- 🔧 `fn` `main` (L86)

### `f/openrouter_benchmark/_benchmark_logic.py`
- 🔧 `fn` `extract_json` (L42)
- ⚡ `async_fn` `run_benchmark_task` (L72)

### `f/openrouter_benchmark/_benchmark_models.py`
- 📦 `class` `ModelCandidate` (L4)
- 📦 `class` `NLUIntent` (L8)
- 📦 `class` `ModelTestResult` (L13)
- 📦 `class` `ModelSummary` (L24)
- 📦 `class` `BenchmarkReport` (L33)
- 📦 `class` `TaskPrompt` (L38)
- 📦 `class` `OpenRouterUsage` (L44)
- 📦 `class` `OpenRouterChoiceMessage` (L49)
- 📦 `class` `OpenRouterChoice` (L53)
- 📦 `class` `OpenRouterResponse` (L57)

### `f/openrouter_benchmark/main.py`
- 🔧 `fn` `main` (L65)

### `f/patient_register/_patient_logic.py`
- ⚡ `async_fn` `upsert_client` (L5)

### `f/patient_register/_patient_models.py`
- 📦 `class` `ClientResult` (L5)
- 📦 `class` `InputSchema` (L14)

### `f/patient_register/main.py`
- ⚡ `async_fn` `operation` (L40)
- 🔧 `fn` `main` (L52)

### `f/provider_agenda/_agenda_logic.py`
- ⚡ `async_fn` `get_provider_agenda` (L6)

### `f/provider_agenda/_agenda_models.py`
- 📦 `class` `AgendaBooking` (L4)
- 📦 `class` `AgendaDay` (L12)
- 📦 `class` `AgendaResult` (L19)
- 📦 `class` `InputSchema` (L26)

### `f/provider_agenda/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L44)

### `f/provider_manage/_manage_logic.py`
- ⚡ `async_fn` `handle_provider_actions` (L5)
- ⚡ `async_fn` `handle_service_actions` (L46)
- ⚡ `async_fn` `handle_schedule_actions` (L97)
- ⚡ `async_fn` `handle_override_actions` (L124)

### `f/provider_manage/_manage_models.py`
- 📦 `class` `InputSchema` (L5)

### `f/provider_manage/main.py`
- ⚡ `async_fn` `operation` (L38)
- 🔧 `fn` `main` (L60)

### `f/rag_query/_rag_logic.py`
- 📦 `class` `KBRepository` (L5)
- ⚡ `async_fn` `fetch_active_entries` (L9)
- 🔧 `fn` `perform_keyword_search` (L43)

### `f/rag_query/_rag_models.py`
- 📦 `class` `KBEntry` (L4)
- 📦 `class` `RAGResult` (L11)
- 📦 `class` `KBRow` (L16)
- 📦 `class` `InputSchema` (L22)

### `f/rag_query/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L59)

### `f/reminder_config/_config_logic.py`
- ⚡ `async_fn` `load_preferences` (L13)
- ⚡ `async_fn` `save_preferences` (L37)
- 🔧 `fn` `build_config_message` (L58)
- 🔧 `fn` `build_window_config` (L75)
- 🔧 `fn` `set_all` (L94)

### `f/reminder_config/_config_models.py`
- 📦 `class` `ReminderPrefs` (L4)
- 📦 `class` `ReminderConfigResult` (L10)
- 📦 `class` `InputSchema` (L15)

### `f/reminder_config/main.py`
- ⚡ `async_fn` `operation` (L35)
- 🔧 `fn` `main` (L95)

### `f/reminder_cron/_reminder_logic.py`
- 🔧 `fn` `format_date_es` (L5)
- 🔧 `fn` `format_time_es` (L14)
- 🔧 `fn` `get_client_preference` (L17)
- 🔧 `fn` `build_booking_details` (L26)
- 🔧 `fn` `build_inline_buttons` (L43)

### `f/reminder_cron/_reminder_models.py`
- 📦 `class` `ReminderPrefs` (L5)
- 📦 `class` `BookingRecord` (L13)
- 📦 `class` `CronResult` (L30)
- 📦 `class` `InputSchema` (L38)

### `f/reminder_cron/_reminder_repository.py`
- ⚡ `async_fn` `get_bookings_for_window` (L6)
- ⚡ `async_fn` `mark_reminder_sent` (L42)

### `f/reminder_cron/main.py`
- ⚡ `async_fn` `provider_batch` (L52)
- 🔧 `fn` `main` (L104)

### `f/telegram_auto_register/_auto_register_logic.py`
- ⚡ `async_fn` `register_telegram_user` (L7)

### `f/telegram_auto_register/_auto_register_models.py`
- 📦 `class` `RegisterResult` (L4)
- 📦 `class` `InputSchema` (L8)

### `f/telegram_auto_register/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L44)

### `f/telegram_callback/_callback_logic.py`
- 🔧 `fn` `parse_callback_data` (L14)
- ⚡ `async_fn` `confirm_booking` (L27)
- ⚡ `async_fn` `update_booking_status` (L58)
- ⚡ `async_fn` `answer_callback_query` (L107)
- ⚡ `async_fn` `send_followup_message` (L121)

### `f/telegram_callback/_callback_models.py`
- 📦 `class` `InputSchema` (L4)
- 📦 `class` `ActionContext` (L14)
- 📦 `class` `ActionResult` (L22)
- 📦 `class` `ActionHandler` (L26)
- ⚡ `async_fn` `handle` (L27)

### `f/telegram_callback/_callback_router.py`
- 📦 `class` `ConfirmHandler` (L7)
- ⚡ `async_fn` `handle` (L8)
- ⚡ `async_fn` `operation` (L11)
- 📦 `class` `CancelHandler` (L34)
- ⚡ `async_fn` `handle` (L35)
- ⚡ `async_fn` `operation` (L38)
- 📦 `class` `AcknowledgeHandler` (L61)
- ⚡ `async_fn` `handle` (L62)
- 📦 `class` `TelegramRouter` (L68)
- 🔧 `fn` `register` (L72)
- ⚡ `async_fn` `route` (L75)

### `f/telegram_callback/main.py`
- 🔧 `fn` `main` (L84)

### `f/telegram_gateway/_gateway_logic.py`
- 📦 `class` `TelegramClient` (L7)
- ⚡ `async_fn` `send_message` (L12)
- 📦 `class` `ClientRepository` (L33)
- ⚡ `async_fn` `ensure_registered` (L37)

### `f/telegram_gateway/_gateway_models.py`
- 📦 `class` `TelegramUser` (L8)
- 📦 `class` `TelegramChat` (L16)
- 📦 `class` `TelegramMessage` (L21)
- 📦 `class` `TelegramCallback` (L29)
- 📦 `class` `TelegramUpdate` (L36)
- 📦 `class` `SendMessageOptions` (L42)

### `f/telegram_gateway/main.py`
- 📦 `class` `TelegramRouter` (L13)
- ⚡ `async_fn` `route_update` (L18)
- ⚡ `async_fn` `handle_callback` (L25)
- ⚡ `async_fn` `handle_message` (L37)
- 🔧 `fn` `main` (L90)

### `f/telegram_menu/_menu_logic.py`
- 📦 `class` `MenuInput` (L3)
- 📦 `class` `MenuResponse` (L9)
- 🔧 `fn` `parse_user_option` (L20)
- 📦 `class` `MenuController` (L26)
- ⚡ `async_fn` `handle` (L27)

### `f/telegram_menu/_menu_models.py`
- 📦 `class` `InlineButton` (L4)
- 📦 `class` `MenuInput` (L8)
- 📦 `class` `MenuResponse` (L13)
- 📦 `class` `InputSchema` (L18)
- 📦 `class` `MenuResult` (L19)

### `f/telegram_menu/main.py`
- 🔧 `fn` `main` (L38)

### `f/telegram_send/_telegram_logic.py`
- 📦 `class` `TelegramService` (L9)
- ⚡ `async_fn` `execute` (L14)
- 🔧 `fn` `prepare_request` (L37)
- ⚡ `async_fn` `api_call` (L78)
- 🔧 `fn` `normalize_keyboard` (L94)

### `f/telegram_send/_telegram_models.py`
- 📦 `class` `InlineButton` (L8)
- 📦 `class` `BaseTelegramInput` (L13)
- 📦 `class` `SendMessageInput` (L18)
- 📦 `class` `EditMessageInput` (L24)
- 📦 `class` `DeleteMessageInput` (L30)
- 📦 `class` `AnswerCallbackInput` (L40)
- 📦 `class` `TelegramInputRoot` (L62)
- 📦 `class` `TelegramResponseResult` (L65)
- 📦 `class` `TelegramResponse` (L68)
- 📦 `class` `TelegramSendData` (L75)

### `f/telegram_send/main.py`
- 🔧 `fn` `main` (L33)

### `f/web_admin_dashboard/_dashboard_logic.py`
- ⚡ `async_fn` `fetch_dashboard_stats` (L5)

### `f/web_admin_dashboard/_dashboard_models.py`
- 📦 `class` `AdminDashboardResult` (L4)
- 📦 `class` `InputSchema` (L12)

### `f/web_admin_dashboard/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L44)

### `f/web_admin_provider_crud/_provider_logic.py`
- 🔧 `fn` `map_row` (L8)
- ⚡ `async_fn` `list_providers` (L38)
- ⚡ `async_fn` `create_provider` (L63)
- ⚡ `async_fn` `update_provider` (L105)
- ⚡ `async_fn` `reset_provider_password` (L143)

### `f/web_admin_provider_crud/_provider_models.py`
- 📦 `class` `ProviderRow` (L4)
- 📦 `class` `CreateProviderResult` (L32)
- 📦 `class` `InputSchema` (L35)

### `f/web_admin_provider_crud/main.py`
- ⚡ `async_fn` `operation` (L39)
- 🔧 `fn` `main` (L65)

### `f/web_admin_regions/_regions_logic.py`
- ⚡ `async_fn` `list_regions` (L5)
- ⚡ `async_fn` `list_communes` (L24)
- ⚡ `async_fn` `search_communes` (L59)

### `f/web_admin_regions/_regions_models.py`
- 📦 `class` `RegionRow` (L4)
- 📦 `class` `CommuneRow` (L11)
- 📦 `class` `InputSchema` (L18)

### `f/web_admin_regions/main.py`
- 🔧 `fn` `main` (L49)

### `f/web_admin_specialties_crud/_specialty_logic.py`
- 🔧 `fn` `map_row` (L6)
- ⚡ `async_fn` `list_specialties` (L17)
- ⚡ `async_fn` `create_specialty` (L24)
- ⚡ `async_fn` `update_specialty` (L41)
- ⚡ `async_fn` `delete_specialty` (L65)
- ⚡ `async_fn` `set_status` (L72)

### `f/web_admin_specialties_crud/_specialty_models.py`
- 📦 `class` `SpecialtyRow` (L4)
- 📦 `class` `InputSchema` (L13)

### `f/web_admin_specialties_crud/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L58)

### `f/web_admin_tags/_tags_logic.py`
- 🔧 `fn` `map_category` (L6)
- 🔧 `fn` `map_tag` (L17)
- ⚡ `async_fn` `verify_admin_access` (L30)
- 📦 `class` `TagRepository` (L36)
- ⚡ `async_fn` `list_categories` (L40)
- ⚡ `async_fn` `create_category` (L56)
- ⚡ `async_fn` `update_category` (L67)
- ⚡ `async_fn` `set_category_status` (L87)
- ⚡ `async_fn` `delete_category` (L98)
- ⚡ `async_fn` `list_tags` (L105)
- ⚡ `async_fn` `create_tag` (L129)
- ⚡ `async_fn` `update_tag` (L144)
- ⚡ `async_fn` `set_tag_status` (L169)
- ⚡ `async_fn` `delete_tag` (L180)

### `f/web_admin_tags/_tags_models.py`
- 📦 `class` `CategoryRow` (L4)
- 📦 `class` `TagRow` (L13)
- 📦 `class` `InputSchema` (L24)

### `f/web_admin_tags/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L86)

### `f/web_admin_users/_user_logic.py`
- 🔧 `fn` `map_row` (L6)
- ⚡ `async_fn` `handle_user_actions` (L20)

### `f/web_admin_users/_user_models.py`
- 📦 `class` `UserInfo` (L4)
- 📦 `class` `UsersListResult` (L16)
- 📦 `class` `InputSchema` (L20)

### `f/web_admin_users/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L52)

### `f/web_auth_change_role/_change_role_models.py`
- 📦 `class` `ChangeRoleResult` (L4)
- 📦 `class` `InputSchema` (L10)

### `f/web_auth_change_role/main.py`
- ⚡ `async_fn` `operation` (L31)
- 🔧 `fn` `main` (L89)

### `f/web_auth_complete_profile/_complete_profile_models.py`
- 📦 `class` `CompleteProfileResult` (L5)
- 📦 `class` `UserRow` (L12)
- 📦 `class` `InputSchema` (L19)

### `f/web_auth_complete_profile/main.py`
- ⚡ `async_fn` `operation` (L42)
- 🔧 `fn` `main` (L111)

### `f/web_auth_login/_login_logic.py`
- 🔧 `fn` `verify_password_sync` (L4)

### `f/web_auth_login/_login_models.py`
- 📦 `class` `LoginResult` (L4)
- 📦 `class` `UserRow` (L11)
- 📦 `class` `InputSchema` (L20)

### `f/web_auth_login/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L94)

### `f/web_auth_me/_me_logic.py`
- ⚡ `async_fn` `get_user_profile` (L6)

### `f/web_auth_me/_me_models.py`
- 📦 `class` `UserProfileResult` (L4)
- 📦 `class` `InputSchema` (L18)

### `f/web_auth_me/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L44)

### `f/web_auth_register/_register_logic.py`
- 🔧 `fn` `validate_rut` (L7)
- 🔧 `fn` `validate_password_strength` (L31)
- 🔧 `fn` `hash_password_sync` (L42)

### `f/web_auth_register/_register_models.py`
- 📦 `class` `RegisterResult` (L5)
- 📦 `class` `InputSchema` (L11)

### `f/web_auth_register/main.py`
- ⚡ `async_fn` `operation` (L41)
- 🔧 `fn` `main` (L90)

### `f/web_booking_api/_booking_logic.py`
- 🔧 `fn` `derive_idempotency_key` (L7)
- 🔧 `fn` `calculate_end_time` (L11)
- 📦 `class` `BookingRepository` (L21)
- ⚡ `async_fn` `resolve_tenant_for_booking` (L25)
- ⚡ `async_fn` `resolve_client_id` (L30)
- ⚡ `async_fn` `lock_provider` (L44)
- ⚡ `async_fn` `get_service_duration` (L49)
- ⚡ `async_fn` `check_overlap` (L54)
- ⚡ `async_fn` `insert_booking` (L72)
- ⚡ `async_fn` `get_booking` (L93)
- ⚡ `async_fn` `update_status` (L98)

### `f/web_booking_api/_booking_models.py`
- 📦 `class` `BookingResult` (L4)
- 📦 `class` `InputSchema` (L9)

### `f/web_booking_api/main.py`
- ⚡ `async_fn` `operation` (L45)
- 🔧 `fn` `main` (L128)

### `f/web_patient_bookings/_bookings_logic.py`
- ⚡ `async_fn` `resolve_client_id` (L9)
- ⚡ `async_fn` `get_patient_bookings` (L27)

### `f/web_patient_bookings/_bookings_models.py`
- 📦 `class` `BookingInfo` (L4)
- 📦 `class` `BookingsResult` (L16)
- 📦 `class` `InputSchema` (L21)

### `f/web_patient_bookings/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L47)

### `f/web_patient_profile/_profile_logic.py`
- 🔧 `fn` `map_to_profile` (L6)
- ⚡ `async_fn` `find_user` (L17)
- ⚡ `async_fn` `find_or_create_client` (L25)
- ⚡ `async_fn` `update_profile` (L46)

### `f/web_patient_profile/_profile_models.py`
- 📦 `class` `ProfileResult` (L4)
- 📦 `class` `InputSchema` (L13)

### `f/web_patient_profile/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L58)

### `f/web_provider_dashboard/_provider_dashboard_logic.py`
- ⚡ `async_fn` `fetch_provider_dashboard` (L6)

### `f/web_provider_dashboard/_provider_dashboard_models.py`
- 📦 `class` `AgendaItem` (L4)
- 📦 `class` `ProviderStats` (L13)
- 📦 `class` `DashboardResult` (L20)
- 📦 `class` `InputSchema` (L27)

### `f/web_provider_dashboard/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L44)

### `f/web_provider_notes/_notes_logic.py`
- 🔧 `fn` `decrypt_content` (L7)
- 🔧 `fn` `map_row_to_note` (L16)
- 📦 `class` `NoteRepository` (L31)
- ⚡ `async_fn` `get_tags` (L35)
- ⚡ `async_fn` `assign_tags` (L48)
- ⚡ `async_fn` `create` (L57)
- ⚡ `async_fn` `read` (L79)
- ⚡ `async_fn` `list_notes` (L88)
- ⚡ `async_fn` `delete` (L122)

### `f/web_provider_notes/_notes_models.py`
- 📦 `class` `Tag` (L4)
- 📦 `class` `NoteRow` (L9)
- 📦 `class` `InputSchema` (L21)

### `f/web_provider_notes/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L69)

### `f/web_provider_profile/_profile_logic.py`
- 📦 `class` `ProfileRepository` (L7)
- ⚡ `async_fn` `find_by_id` (L11)
- ⚡ `async_fn` `update` (L62)
- ⚡ `async_fn` `get_password_hash` (L88)
- ⚡ `async_fn` `update_password` (L95)

### `f/web_provider_profile/_profile_models.py`
- 📦 `class` `ProfileRow` (L4)
- 📦 `class` `InputSchema` (L25)

### `f/web_provider_profile/main.py`
- ⚡ `async_fn` `operation` (L33)
- 🔧 `fn` `main` (L79)

### `f/web_waitlist/_waitlist_logic.py`
- ⚡ `async_fn` `resolve_client_id` (L6)
- ⚡ `async_fn` `handle_join` (L25)
- ⚡ `async_fn` `handle_leave` (L68)
- ⚡ `async_fn` `handle_list` (L85)
- ⚡ `async_fn` `handle_check_position` (L109)

### `f/web_waitlist/_waitlist_models.py`
- 📦 `class` `WaitlistEntry` (L4)
- 📦 `class` `WaitlistResult` (L13)
- 📦 `class` `InputSchema` (L18)

### `f/web_waitlist/main.py`
- ⚡ `async_fn` `operation` (L34)
- 🔧 `fn` `main` (L61)

## Windmill Scripts

- `f/__init__.script.yaml`
- `f/admin_honorifics/_honorifics_logic.script.yaml`
- `f/admin_honorifics/_honorifics_models.script.yaml`
- `f/admin_honorifics/main.script.yaml`
- `f/auth_provider/_auth_logic.script.yaml`
- `f/auth_provider/_auth_models.script.yaml`
- `f/auth_provider/main.script.yaml`
- `f/availability_check/_availability_logic.script.yaml`
- `f/availability_check/_availability_models.script.yaml`
- `f/availability_check/main.script.yaml`
- `f/booking_cancel/_booking_cancel_models.script.yaml`
- `f/booking_cancel/_booking_cancel_repository.script.yaml`
- `f/booking_cancel/_cancel_booking_logic.script.yaml`
- `f/booking_cancel/main.script.yaml`
- `f/booking_create/_booking_create_models.script.yaml`
- `f/booking_create/_booking_create_repository.script.yaml`
- `f/booking_create/_create_booking_logic.script.yaml`
- `f/booking_create/main.script.yaml`
- `f/booking_orchestrator/_context_resolver.script.yaml`
- `f/booking_orchestrator/_get_entity.script.yaml`
- `f/booking_orchestrator/_intent_router.script.yaml`
- `f/booking_orchestrator/_orchestrator_models.script.yaml`
- `f/booking_orchestrator/handlers/_cancel.script.yaml`
- `f/booking_orchestrator/handlers/_create.script.yaml`
- `f/booking_orchestrator/handlers/_get_my_bookings.script.yaml`
- `f/booking_orchestrator/handlers/_list_available.script.yaml`
- `f/booking_orchestrator/handlers/_reschedule.script.yaml`
- `f/booking_orchestrator/main.script.yaml`
- `f/booking_reschedule/_reschedule_logic.script.yaml`
- `f/booking_reschedule/_reschedule_models.script.yaml`
- `f/booking_reschedule/_reschedule_repository.script.yaml`
- `f/booking_reschedule/main.script.yaml`
- `f/booking_search/_search_logic.script.yaml`
- `f/booking_search/_search_models.script.yaml`
- `f/booking_search/main.script.yaml`
- `f/booking_wizard/_wizard_logic.script.yaml`
- `f/booking_wizard/_wizard_models.script.yaml`
- `f/booking_wizard/main.script.yaml`
- `f/circuit_breaker/_circuit_logic.script.yaml`
- `f/circuit_breaker/_circuit_models.script.yaml`
- `f/circuit_breaker/main.script.yaml`
- `f/conversation_logger/_logger_logic.script.yaml`
- `f/conversation_logger/_logger_models.script.yaml`
- `f/conversation_logger/main.script.yaml`
- `f/distributed_lock/_lock_logic.script.yaml`
- `f/distributed_lock/_lock_models.script.yaml`
- `f/distributed_lock/main.script.yaml`
- `f/dlq_processor/_dlq_logic.script.yaml`
- `f/dlq_processor/_dlq_models.script.yaml`
- `f/dlq_processor/main.script.yaml`
- `f/gcal_reconcile/_reconcile_logic.script.yaml`
- `f/gcal_reconcile/_reconcile_models.script.yaml`
- `f/gcal_reconcile/main.script.yaml`
- `f/gcal_sync/_gcal_api_adapter.script.yaml`
- `f/gcal_sync/_gcal_sync_models.script.yaml`
- `f/gcal_sync/_sync_event_logic.script.yaml`
- `f/gcal_sync/_update_sync_status.script.yaml`
- `f/gcal_sync/main.script.yaml`
- `f/gmail_send/_gmail_logic.script.yaml`
- `f/gmail_send/_gmail_models.script.yaml`
- `f/gmail_send/main.script.yaml`
- `f/health_check/_health_logic.script.yaml`
- `f/health_check/_health_models.script.yaml`
- `f/health_check/main.script.yaml`
- `f/internal/__init__.script.yaml`
- `f/internal/_config.script.yaml`
- `f/internal/_crypto.script.yaml`
- `f/internal/_date_resolver.script.yaml`
- `f/internal/_db_client.script.yaml`
- `f/internal/_result.script.yaml`
- `f/internal/_state_machine.script.yaml`
- `f/internal/_wmill_adapter.script.yaml`
- `f/internal/ai_agent/__init__.script.yaml`
- `f/internal/ai_agent/_ai_agent_logic.script.yaml`
- `f/internal/ai_agent/_ai_agent_models.script.yaml`
- `f/internal/ai_agent/_constants.script.yaml`
- `f/internal/ai_agent/_guardrails.script.yaml`
- `f/internal/ai_agent/_llm_client.script.yaml`
- `f/internal/ai_agent/_prompt_builder.script.yaml`
- `f/internal/ai_agent/_rag_context.script.yaml`
- `f/internal/ai_agent/_tfidf_classifier.script.yaml`
- `f/internal/ai_agent/main.script.yaml`
- `f/internal/apply_fix_migration.script.yaml`
- `f/internal/booking_fsm/__init__.script.yaml`
- `f/internal/booking_fsm/_fsm_machine.script.yaml`
- `f/internal/booking_fsm/_fsm_models.script.yaml`
- `f/internal/booking_fsm/_fsm_responses.script.yaml`
- `f/internal/debug_db.script.yaml`
- `f/internal/debug_db_final.script.yaml`
- `f/internal/gcal_utils/__init__.script.yaml`
- `f/internal/gcal_utils/_gcal_logic.script.yaml`
- `f/internal/gcal_utils/_gcal_models.script.yaml`
- `f/internal/gcal_utils/_oauth_logic.script.yaml`
- `f/internal/scheduling_engine/__init__.script.yaml`
- `f/internal/scheduling_engine/_scheduling_logic.script.yaml`
- `f/internal/scheduling_engine/_scheduling_models.script.yaml`
- `f/internal/test_var.script.yaml`
- `f/nlu/__init__.script.yaml`
- `f/nlu/_constants.script.yaml`
- `f/nlu/_tfidf_classifier.script.yaml`
- `f/nlu/main.script.yaml`
- `f/noshow_trigger/_noshow_logic.script.yaml`
- `f/noshow_trigger/_noshow_models.script.yaml`
- `f/noshow_trigger/main.script.yaml`
- `f/openrouter_benchmark/_benchmark_logic.script.yaml`
- `f/openrouter_benchmark/_benchmark_models.script.yaml`
- `f/openrouter_benchmark/main.script.yaml`
- `f/patient_register/_patient_logic.script.yaml`
- `f/patient_register/_patient_models.script.yaml`
- `f/patient_register/main.script.yaml`
- `f/provider_agenda/_agenda_logic.script.yaml`
- `f/provider_agenda/_agenda_models.script.yaml`
- `f/provider_agenda/main.script.yaml`
- `f/provider_manage/_manage_logic.script.yaml`
- `f/provider_manage/_manage_models.script.yaml`
- `f/provider_manage/main.script.yaml`
- `f/rag_query/_rag_logic.script.yaml`
- `f/rag_query/_rag_models.script.yaml`
- `f/rag_query/main.script.yaml`
- `f/reminder_config/_config_logic.script.yaml`
- `f/reminder_config/_config_models.script.yaml`
- `f/reminder_config/main.script.yaml`
- `f/reminder_cron/_reminder_logic.script.yaml`
- `f/reminder_cron/_reminder_models.script.yaml`
- `f/reminder_cron/_reminder_repository.script.yaml`
- `f/reminder_cron/main.script.yaml`
- `f/telegram_auto_register/_auto_register_logic.script.yaml`
- `f/telegram_auto_register/_auto_register_models.script.yaml`
- `f/telegram_auto_register/main.script.yaml`
- `f/telegram_callback/_callback_logic.script.yaml`
- `f/telegram_callback/_callback_models.script.yaml`
- `f/telegram_callback/_callback_router.script.yaml`
- `f/telegram_callback/main.script.yaml`
- `f/telegram_gateway/_gateway_logic.script.yaml`
- `f/telegram_gateway/_gateway_models.script.yaml`
- `f/telegram_gateway/main.script.yaml`
- `f/telegram_menu/_menu_logic.script.yaml`
- `f/telegram_menu/_menu_models.script.yaml`
- `f/telegram_menu/main.script.yaml`
- `f/telegram_send/_telegram_logic.script.yaml`
- `f/telegram_send/_telegram_models.script.yaml`
- `f/telegram_send/main.script.yaml`
- `f/web_admin_dashboard/_dashboard_logic.script.yaml`
- `f/web_admin_dashboard/_dashboard_models.script.yaml`
- `f/web_admin_dashboard/main.script.yaml`
- `f/web_admin_provider_crud/_provider_logic.script.yaml`
- `f/web_admin_provider_crud/_provider_models.script.yaml`
- `f/web_admin_provider_crud/main.script.yaml`
- `f/web_admin_regions/_regions_logic.script.yaml`
- `f/web_admin_regions/_regions_models.script.yaml`
- `f/web_admin_regions/main.script.yaml`
- `f/web_admin_specialties_crud/_specialty_logic.script.yaml`
- `f/web_admin_specialties_crud/_specialty_models.script.yaml`
- `f/web_admin_specialties_crud/main.script.yaml`
- `f/web_admin_tags/_tags_logic.script.yaml`
- `f/web_admin_tags/_tags_models.script.yaml`
- `f/web_admin_tags/main.script.yaml`
- `f/web_admin_users/_user_logic.script.yaml`
- `f/web_admin_users/_user_models.script.yaml`
- `f/web_admin_users/main.script.yaml`
- `f/web_auth_change_role/_change_role_models.script.yaml`
- `f/web_auth_change_role/main.script.yaml`
- `f/web_auth_complete_profile/_complete_profile_models.script.yaml`
- `f/web_auth_complete_profile/main.script.yaml`
- `f/web_auth_login/_login_logic.script.yaml`
- `f/web_auth_login/_login_models.script.yaml`
- `f/web_auth_login/main.script.yaml`
- `f/web_auth_me/_me_logic.script.yaml`
- `f/web_auth_me/_me_models.script.yaml`
- `f/web_auth_me/main.script.yaml`
- `f/web_auth_register/_register_logic.script.yaml`
- `f/web_auth_register/_register_models.script.yaml`
- `f/web_auth_register/main.script.yaml`
- `f/web_booking_api/_booking_logic.script.yaml`
- `f/web_booking_api/_booking_models.script.yaml`
- `f/web_booking_api/main.script.yaml`
- `f/web_patient_bookings/_bookings_logic.script.yaml`
- `f/web_patient_bookings/_bookings_models.script.yaml`
- `f/web_patient_bookings/main.script.yaml`
- `f/web_patient_profile/_profile_logic.script.yaml`
- `f/web_patient_profile/_profile_models.script.yaml`
- `f/web_patient_profile/main.script.yaml`
- `f/web_provider_dashboard/_provider_dashboard_logic.script.yaml`
- `f/web_provider_dashboard/_provider_dashboard_models.script.yaml`
- `f/web_provider_dashboard/main.script.yaml`
- `f/web_provider_notes/_notes_logic.script.yaml`
- `f/web_provider_notes/_notes_models.script.yaml`
- `f/web_provider_notes/main.script.yaml`
- `f/web_provider_profile/_profile_logic.script.yaml`
- `f/web_provider_profile/_profile_models.script.yaml`
- `f/web_provider_profile/main.script.yaml`
- `f/web_waitlist/_waitlist_logic.script.yaml`
- `f/web_waitlist/_waitlist_models.script.yaml`
- `f/web_waitlist/main.script.yaml`
