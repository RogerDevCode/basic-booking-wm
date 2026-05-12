# Codebase Index

> Read this file BEFORE exploring the repository. Use it to map architecture to logic.

## Module Map

### `f/admin_honorifics/_honorifics_logic.py`
- 🔧 `fn` `map_row` (L11)
- ⚡ `async_fn` `list_honorifics` (L27)
- ⚡ `async_fn` `create_honorific` (L36)
- ⚡ `async_fn` `update_honorific` (L62)
- ⚡ `async_fn` `delete_honorific` (L122)

### `f/admin_honorifics/_honorifics_models.py`
- 📦 `class` `HonorificRow` (L8)
- 📦 `class` `InputSchema` (L20)

### `f/admin_honorifics/main.py`
- ⚡ `async_fn` `list_op` (L50)
- ⚡ `async_fn` `operation` (L56)
- 🔧 `fn` `main` (L96)

### `f/admin_schedule_seed/main.py`
- 🔧 `fn` `main` (L148)

### `f/auth_provider/_auth_logic.py`
- 🔧 `fn` `generate_readable_password` (L17)
- ⚡ `async_fn` `admin_generate_temp_password` (L23)
- ⚡ `async_fn` `provider_change_password` (L59)
- ⚡ `async_fn` `provider_verify` (L94)

### `f/auth_provider/_auth_models.py`
- 📦 `class` `TempPasswordResult` (L6)
- 📦 `class` `PasswordChangeResult` (L14)
- 📦 `class` `VerifyResult` (L19)
- 📦 `class` `InputSchema` (L25)

### `f/auth_provider/main.py`
- ⚡ `async_fn` `operation` (L48)
- 🔧 `fn` `main` (L70)

### `f/auto_cancel_expired/main.py`
- 🔧 `fn` `main` (L79)

### `f/availability_check/_availability_logic.py`
- ⚡ `async_fn` `get_provider_service_id` (L10)
- ⚡ `async_fn` `get_provider` (L28)

### `f/availability_check/_availability_models.py`
- 📦 `class` `InputSchema` (L11)
- 📦 `class` `AvailabilityResult` (L22)
- 📦 `class` `ProviderRow` (L34)

### `f/availability_check/main.py`
- ⚡ `async_fn` `run_availability_check` (L39)
- ⚡ `async_fn` `operation` (L46)
- ⚡ `async_fn` `main_async` (L90)
- 🔧 `fn` `main` (L101)

### `f/booking_cancel/_booking_cancel_models.py`
- 📦 `class` `CancelBookingInput` (L8)
- 📦 `class` `CancelResult` (L18)
- 📦 `class` `BookingLookup` (L26)
- 📦 `class` `UpdatedBooking` (L35)

### `f/booking_cancel/_booking_cancel_repository.py`
- 📦 `class` `BookingCancelRepository` (L9)
- ⚡ `async_fn` `fetch_booking` (L10)
- ⚡ `async_fn` `lock_booking` (L11)
- ⚡ `async_fn` `update_booking_status` (L12)
- ⚡ `async_fn` `insert_audit_trail` (L13)
- ⚡ `async_fn` `trigger_gcal_sync` (L14)
- 📦 `class` `PostgresBookingCancelRepository` (L17)
- ⚡ `async_fn` `fetch_booking` (L21)
- ⚡ `async_fn` `lock_booking` (L43)
- ⚡ `async_fn` `update_booking_status` (L56)
- ⚡ `async_fn` `insert_audit_trail` (L81)
- ⚡ `async_fn` `trigger_gcal_sync` (L109)

### `f/booking_cancel/_cancel_booking_logic.py`
- 📦 `class` `CancelBookingError` (L12)
- 🔧 `fn` `authorize_actor` (L15)
- ⚡ `async_fn` `execute_cancel_booking` (L23)

### `f/booking_cancel/main.py`
- ⚡ `async_fn` `run_cancel_booking` (L31)
- ⚡ `async_fn` `operation` (L49)
- ⚡ `async_fn` `main_async` (L68)
- 🔧 `fn` `main` (L81)

### `f/booking_create/_booking_create_models.py`
- 📦 `class` `InputSchema` (L9)
- 🔧 `fn` `parse_datetime` (L23)
- 📦 `class` `BookingCreated` (L32)
- 📦 `class` `ClientContext` (L42)
- 📦 `class` `ProviderContext` (L47)
- 📦 `class` `ServiceContext` (L52)
- 📦 `class` `BookingContext` (L58)

### `f/booking_create/_booking_create_repository.py`
- 📦 `class` `BookingCreateRepository` (L20)
- ⚡ `async_fn` `get_client_context` (L21)
- ⚡ `async_fn` `get_provider_context` (L22)
- ⚡ `async_fn` `get_service_context` (L23)
- ⚡ `async_fn` `get_booking_context` (L24)
- ⚡ `async_fn` `is_provider_blocked` (L25)
- ⚡ `async_fn` `is_provider_scheduled` (L26)
- ⚡ `async_fn` `has_overlapping_booking` (L27)
- ⚡ `async_fn` `has_active_booking_for_client` (L28)
- ⚡ `async_fn` `has_client_overlap` (L29)
- ⚡ `async_fn` `insert_booking` (L30)
- 📦 `class` `PostgresBookingCreateRepository` (L41)
- ⚡ `async_fn` `get_client_context` (L45)
- ⚡ `async_fn` `get_provider_context` (L53)
- ⚡ `async_fn` `get_service_context` (L67)
- ⚡ `async_fn` `get_booking_context` (L90)
- ⚡ `async_fn` `is_provider_blocked` (L127)
- ⚡ `async_fn` `is_provider_scheduled` (L141)
- ⚡ `async_fn` `has_client_overlap` (L154)
- ⚡ `async_fn` `has_active_booking_for_client` (L170)
- ⚡ `async_fn` `has_overlapping_booking` (L183)
- ⚡ `async_fn` `insert_booking` (L199)

### `f/booking_create/_create_booking_logic.py`
- ⚡ `async_fn` `fetch_booking_context` (L8)
- ⚡ `async_fn` `persist_booking` (L18)
- ⚡ `async_fn` `execute_create_booking` (L35)

### `f/booking_create/main.py`
- ⚡ `async_fn` `run_create_booking` (L37)
- ⚡ `async_fn` `operation` (L42)
- ⚡ `async_fn` `main_async` (L54)
- 🔧 `fn` `main` (L67)

### `f/booking_orchestrator/_context_resolver.py`
- ⚡ `async_fn` `resolve_context` (L24)

### `f/booking_orchestrator/_get_entity.py`
- 🔧 `fn` `get_entity` (L15)

### `f/booking_orchestrator/_intent_router.py`
- 🔧 `fn` `normalize_intent` (L37)

### `f/booking_orchestrator/_orchestrator_models.py`
- 📦 `class` `OrchestratorInput` (L39)
- 📦 `class` `OrchestratorResult` (L57)
- 📦 `class` `ResolvedContext` (L68)
- 📦 `class` `AvailabilitySlot` (L77)
- 📦 `class` `AvailabilityData` (L82)
- 📦 `class` `BookingRow` (L89)

### `f/booking_orchestrator/handlers/_cancel.py`
- ⚡ `async_fn` `handle_cancel_booking` (L27)

### `f/booking_orchestrator/handlers/_create.py`
- ⚡ `async_fn` `handle_create_booking` (L26)

### `f/booking_orchestrator/handlers/_get_my_bookings.py`
- ⚡ `async_fn` `handle_get_my_bookings` (L26)
- ⚡ `async_fn` `operation` (L35)

### `f/booking_orchestrator/handlers/_list_available.py`
- ⚡ `async_fn` `handle_list_available` (L24)

### `f/booking_orchestrator/handlers/_reschedule.py`
- ⚡ `async_fn` `handle_reschedule` (L27)

### `f/booking_orchestrator/main.py`
- 🔧 `fn` `main` (L125)

### `f/booking_reschedule/_reschedule_logic.py`
- 📦 `class` `RescheduleBookingError` (L11)
- 🔧 `fn` `authorize` (L14)
- ⚡ `async_fn` `execute_reschedule_logic` (L22)

### `f/booking_reschedule/_reschedule_models.py`
- 📦 `class` `RescheduleInput` (L12)
- 🔧 `fn` `parse_datetime` (L25)
- 📦 `class` `RescheduleResult` (L34)
- 📦 `class` `RescheduleWriteResult` (L44)
- 📦 `class` `BookingRow` (L53)
- 📦 `class` `ServiceRow` (L64)

### `f/booking_reschedule/_reschedule_repository.py`
- 📦 `class` `RescheduleRepository` (L14)
- ⚡ `async_fn` `fetch_booking` (L15)
- ⚡ `async_fn` `fetch_service` (L16)
- ⚡ `async_fn` `check_overlap` (L17)
- ⚡ `async_fn` `execute_reschedule` (L20)
- 📦 `class` `PostgresRescheduleRepository` (L25)
- ⚡ `async_fn` `fetch_booking` (L29)
- ⚡ `async_fn` `fetch_service` (L52)
- ⚡ `async_fn` `check_overlap` (L69)
- ⚡ `async_fn` `execute_reschedule` (L89)

### `f/booking_reschedule/main.py`
- ⚡ `async_fn` `run_reschedule_booking` (L32)
- ⚡ `async_fn` `operation` (L59)
- ⚡ `async_fn` `main_async` (L80)
- 🔧 `fn` `main` (L93)

### `f/booking_search/_search_logic.py`
- ⚡ `async_fn` `execute_search` (L10)

### `f/booking_search/_search_models.py`
- 📦 `class` `SearchInput` (L6)
- 📦 `class` `BookingSearchRow` (L21)
- 📦 `class` `BookingSearchResult` (L33)

### `f/booking_search/main.py`
- 🔧 `fn` `main` (L71)

### `f/booking_wizard/_wizard_logic.py`
- 📦 `class` `DateUtils` (L18)
- 🔧 `fn` `format_es` (L20)
- 🔧 `fn` `get_week_dates` (L40)
- 🔧 `fn` `generate_time_slots` (L55)
- 📦 `class` `WizardUI` (L63)
- 🔧 `fn` `build_date_selection` (L65)
- 🔧 `fn` `build_time_selection` (L87)
- 🔧 `fn` `build_confirmation` (L103)
- 📦 `class` `WizardRepository` (L114)
- ⚡ `async_fn` `get_provider_tz` (L118)
- ⚡ `async_fn` `get_service_duration` (L133)
- ⚡ `async_fn` `get_available_slots` (L141)
- ⚡ `async_fn` `get_names` (L172)
- ⚡ `async_fn` `create_booking` (L179)

### `f/booking_wizard/_wizard_models.py`
- 📦 `class` `WizardState` (L8)
- 📦 `class` `StepView` (L18)
- 📦 `class` `InputSchema` (L26)
- 📦 `class` `WizardResult` (L37)

### `f/booking_wizard/main.py`
- ⚡ `async_fn` `operation` (L58)
- 🔧 `fn` `main` (L202)

### `f/circuit_breaker/_circuit_logic.py`
- ⚡ `async_fn` `get_state` (L11)
- 🔧 `fn` `to_iso` (L30)
- ⚡ `async_fn` `init_service` (L54)

### `f/circuit_breaker/_circuit_models.py`
- 📦 `class` `CircuitState` (L6)
- 📦 `class` `CircuitBreakerResult` (L21)
- 📦 `class` `InputSchema` (L31)

### `f/circuit_breaker/main.py`
- ⚡ `async_fn` `operation` (L48)
- 🔧 `fn` `main` (L124)

### `f/conversation_logger/_logger_logic.py`
- ⚡ `async_fn` `persist_log` (L11)

### `f/conversation_logger/_logger_models.py`
- 📦 `class` `LogResult` (L8)
- 📦 `class` `InputSchema` (L12)

### `f/conversation_logger/main.py`
- ⚡ `async_fn` `operation` (L46)
- 🔧 `fn` `main` (L58)

### `f/distributed_lock/_lock_logic.py`
- 🔧 `fn` `map_row_to_lock_info` (L11)
- 🔧 `fn` `to_iso` (L14)
- ⚡ `async_fn` `acquire_lock` (L30)
- ⚡ `async_fn` `release_lock` (L79)
- ⚡ `async_fn` `check_lock` (L97)
- ⚡ `async_fn` `cleanup_locks` (L117)

### `f/distributed_lock/_lock_models.py`
- 📦 `class` `LockInfo` (L8)
- 📦 `class` `LockResult` (L18)
- 📦 `class` `LockRow` (L29)
- 📦 `class` `InputSchema` (L39)

### `f/distributed_lock/main.py`
- ⚡ `async_fn` `operation` (L49)
- 🔧 `fn` `main` (L73)

### `f/dlq_processor/_dlq_logic.py`
- 🔧 `fn` `map_row_to_dlq_entry` (L12)
- 🔧 `fn` `to_iso` (L15)
- ⚡ `async_fn` `list_dlq` (L50)
- ⚡ `async_fn` `retry_dlq` (L66)
- ⚡ `async_fn` `resolve_dlq` (L95)
- ⚡ `async_fn` `discard_dlq` (L115)
- ⚡ `async_fn` `get_dlq_status_stats` (L133)

### `f/dlq_processor/_dlq_models.py`
- 📦 `class` `DLQEntry` (L8)
- 📦 `class` `DLQListResult` (L26)
- 📦 `class` `InputSchema` (L31)

### `f/dlq_processor/main.py`
- ⚡ `async_fn` `operation` (L46)
- 🔧 `fn` `main` (L73)

### `f/flows/telegram_webhook__flow/Gate_—_si_el_router_manejó,_saltar_AI_Agent_y_orchestrator.py`
- 🔧 `fn` `main` (L6)

### `f/flows/telegram_webhook__flow/Lógica_de_Eco_(Nodo_de_Validación).py`
- 🔧 `fn` `main` (L12)

### `f/flows/telegram_webhook__flow/Lógica_de_Eco_con_Contador_(Nodo_de_Validación).py`
- 🔧 `fn` `main` (L6)

### `f/flows/telegram_webhook__flow/gates/check_parser_error.py`
- 🔧 `fn` `main` (L10)

### `f/flows/telegram_webhook__flow/gates/gate_execute_action.py`
- 🔧 `fn` `main` (L10)

### `f/flows/telegram_webhook__flow/gates/skip_if_router_handled.py`
- 🔧 `fn` `main` (L13)

### `f/flows/telegram_webhook__flow/lógica_de_eco_con_contador_(nodo_de_validación).py`
- 🔧 `fn` `main` (L22)

### `f/flows/telegram_webhook__flow/telegram_webhook_trigger.py`
- 🔧 `fn` `main` (L121)

### `f/gcal_reconcile/_reconcile_logic.py`
- ⚡ `async_fn` `retry_with_backoff` (L20)
- ⚡ `async_fn` `call_gcal_api` (L38)
- ⚡ `async_fn` `sync_booking_to_gcal` (L74)
- ⚡ `async_fn` `sync_op` (L96)
- ⚡ `async_fn` `sync_op_cli` (L111)

### `f/gcal_reconcile/_reconcile_models.py`
- 📦 `class` `InputSchema` (L8)
- 📦 `class` `ReconcileResult` (L17)
- 📦 `class` `BookingRow` (L26)
- 📦 `class` `SyncResult` (L41)

### `f/gcal_reconcile/main.py`
- ⚡ `async_fn` `provider_batch` (L61)
- 🔧 `fn` `main` (L183)

### `f/gcal_sync/_gcal_api_adapter.py`
- ⚡ `async_fn` `fetch_booking_details` (L16)
- ⚡ `async_fn` `operation` (L17)
- ⚡ `async_fn` `call_gcal_api` (L73)

### `f/gcal_sync/_gcal_sync_models.py`
- 📦 `class` `GCalSyncResult` (L8)
- 📦 `class` `BookingDetails` (L17)
- 📦 `class` `InputSchema` (L29)

### `f/gcal_sync/_sync_event_logic.py`
- ⚡ `async_fn` `sync_event` (L13)

### `f/gcal_sync/_update_sync_status.py`
- ⚡ `async_fn` `update_booking_sync_status` (L6)
- ⚡ `async_fn` `operation` (L16)

### `f/gcal_sync/main.py`
- 🔧 `fn` `main` (L105)

### `f/gmail_send/_gmail_logic.py`
- 🔧 `fn` `safe_string` (L14)
- 🔧 `fn` `build_email_content` (L22)
- ⚡ `async_fn` `send_with_retry` (L138)
- 🔧 `fn` `do_send` (L145)

### `f/gmail_send/_gmail_models.py`
- 📦 `class` `ActionLink` (L8)
- 📦 `class` `GmailSendData` (L15)
- 📦 `class` `InputSchema` (L23)

### `f/gmail_send/main.py`
- 🔧 `fn` `main` (L81)

### `f/health_check/_health_logic.py`
- ⚡ `async_fn` `check_database` (L9)
- ⚡ `async_fn` `check_gcal` (L22)
- ⚡ `async_fn` `check_telegram` (L52)
- 🔧 `fn` `check_gmail` (L79)

### `f/health_check/_health_models.py`
- 📦 `class` `ComponentStatus` (L6)
- 📦 `class` `HealthResult` (L13)
- 📦 `class` `InputSchema` (L19)

### `f/health_check/main.py`
- 🔧 `fn` `main` (L81)

### `f/internal/_booking_utils.py`
- 📦 `class` `ActiveBookingInfo` (L9)
- ⚡ `async_fn` `get_active_booking_for_provider` (L16)

### `f/internal/_config.py`
- 🔧 `fn` `get_env` (L52)
- 🔧 `fn` `require_env` (L56)
- 🔧 `fn` `require_database_url` (L63)

### `f/internal/_crypto.py`
- 🔧 `fn` `hash_password` (L19)
- 🔧 `fn` `verify_password` (L25)
- 📦 `class` `PasswordPolicyResult` (L40)
- 🔧 `fn` `validate_password_policy` (L45)
- 🔧 `fn` `get_encryption_key` (L73)
- 🔧 `fn` `encrypt_data` (L81)
- 🔧 `fn` `decrypt_data` (L91)

### `f/internal/_date_resolver.py`
- 📦 `class` `ResolveDateOpts` (L21)
- 🔧 `fn` `resolve_date` (L81)
- 🔧 `fn` `resolve_time` (L140)
- 🔧 `fn` `today_ymd` (L167)

### `f/internal/_db_client.py`
- ⚡ `async_fn` `fetch` (L13)
- ⚡ `async_fn` `fetchrow` (L15)
- ⚡ `async_fn` `fetchval` (L17)
- ⚡ `async_fn` `execute` (L19)
- ⚡ `async_fn` `close` (L21)
- ⚡ `async_fn` `create_db_client` (L46)
- 📦 `class` `AsyncpgWrapper` (L58)
- ⚡ `async_fn` `fetch` (L62)
- ⚡ `async_fn` `fetchrow` (L66)
- ⚡ `async_fn` `fetchval` (L70)
- ⚡ `async_fn` `execute` (L74)
- ⚡ `async_fn` `close` (L78)

### `f/internal/_file_lock.py`
- 📦 `class` `FileLockError` (L17)
- 🔧 `fn` `exclusive_file_lock` (L24)
- 🔧 `fn` `shared_file_lock` (L94)

### `f/internal/_nlu_cache.py`
- 🔧 `fn` `get_redis_client` (L14)
- ⚡ `async_fn` `load_nlu_rules_to_redis` (L19)
- ⚡ `async_fn` `ensure_nlu_cache` (L42)
- 🔧 `fn` `get_nlu_rule` (L100)

### `f/internal/_redis_client.py`
- ⚡ `async_fn` `create_redis_client` (L33)

### `f/internal/_result.py`
- 📦 `class` `DBClient` (L15)
- ⚡ `async_fn` `fetch` (L18)
- ⚡ `async_fn` `fetchrow` (L20)
- ⚡ `async_fn` `fetchval` (L22)
- ⚡ `async_fn` `execute` (L24)
- ⚡ `async_fn` `close` (L26)
- ⚡ `async_fn` `with_tenant_context` (L29)
- ⚡ `async_fn` `with_admin_context` (L51)

### `f/internal/_state_machine.py`
- 🔧 `fn` `validate_transition` (L32)

### `f/internal/_wmill_adapter.py`
- 🔧 `fn` `is_dict_str_obj` (L21)
- 🔧 `fn` `get_variable` (L25)
- 🔧 `fn` `get_resource` (L36)
- 🔧 `fn` `run_script` (L47)
- 🔧 `fn` `log` (L77)

### `f/internal/ai_agent/_ai_agent_logic.py`
- 🔧 `fn` `adjust_intent_with_context` (L22)
- 🔧 `fn` `extract_entities` (L71)
- 🔧 `fn` `detect_context` (L147)
- 🔧 `fn` `determine_escalation_level` (L184)
- 🔧 `fn` `generate_ai_response` (L209)
- 🔧 `fn` `detect_social` (L226)

### `f/internal/ai_agent/_ai_agent_models.py`
- 📦 `class` `ConversationState` (L11)
- 📦 `class` `UserProfile` (L30)
- 📦 `class` `AIAgentInput` (L37)
- 📦 `class` `EntityMap` (L48)
- 📦 `class` `AvailabilityContext` (L63)
- 📦 `class` `ContextAdjustment` (L75)
- 📦 `class` `IntentResult` (L94)
- 📦 `class` `LLMOutputEntities` (L115)
- 📦 `class` `LLMOutput` (L123)

### `f/internal/ai_agent/_constants.py`
- 📦 `class` `IntentsStruct` (L27)

### `f/internal/ai_agent/_guardrails.py`
- 📦 `class` `GuardrailPass` (L9)
- 📦 `class` `GuardrailBlocked` (L13)
- 🔧 `fn` `validate_input` (L43)
- 🔧 `fn` `validate_output` (L61)
- 🔧 `fn` `sanitize_json_response` (L75)
- 🔧 `fn` `verify_urgency` (L89)

### `f/internal/ai_agent/_llm_client.py`
- 📦 `class` `ChatMessage` (L18)
- 📦 `class` `ProviderConfig` (L23)
- 📦 `class` `LLMResponse` (L31)
- ⚡ `async_fn` `call_llm` (L41)

### `f/internal/ai_agent/_prompt_builder.py`
- 🔧 `fn` `build_system_prompt` (L79)
- 🔧 `fn` `build_user_message` (L95)

### `f/internal/ai_agent/_rag_context.py`
- 📦 `class` `RAGResult` (L6)
- ⚡ `async_fn` `build_rag_context` (L12)
- ⚡ `async_fn` `get_rag_context` (L54)

### `f/internal/ai_agent/_tfidf_classifier.py`
- 🔧 `fn` `normalize` (L160)
- 🔧 `fn` `compute_tf` (L181)
- 🔧 `fn` `compute_idf` (L189)
- 🔧 `fn` `cosine_similarity` (L199)
- 📦 `class` `TfIdfModel` (L215)
- 📦 `class` `Score` (L226)
- 📦 `class` `TfIdfResult` (L231)
- 🔧 `fn` `classify_intent` (L237)

### `f/internal/ai_agent/main.py`
- 🔧 `fn` `main` (L150)

### `f/internal/apply_fix_migration.py`
- 🔧 `fn` `main` (L24)

### `f/internal/booking_confirm/main.py`
- ⚡ `async_fn` `operation` (L150)
- 🔧 `fn` `main` (L191)

### `f/internal/booking_fsm/_fsm_machine.py`
- 🔧 `fn` `get_main_menu_text` (L46)
- 🔧 `fn` `parse_action` (L59)
- 🔧 `fn` `parse_callback_data` (L86)
- 🔧 `fn` `apply_transition` (L103)
- 🔧 `fn` `flow_step_from_state` (L396)

### `f/internal/booking_fsm/_fsm_models.py`
- 📦 `class` `NamedItem` (L20)
- 📦 `class` `TimeSlotItem` (L25)
- 📦 `class` `DraftCore` (L36)
- 📦 `class` `DraftBooking` (L48)
- 🔧 `fn` `empty_draft` (L56)
- 📦 `class` `IdleState` (L65)
- 📦 `class` `SelectingSpecialtyState` (L69)
- 📦 `class` `SelectingDoctorState` (L75)
- 📦 `class` `SelectingTimeState` (L83)
- 📦 `class` `ConfirmingState` (L93)
- 📦 `class` `CompletedState` (L103)
- 📦 `class` `BookingStateRoot` (L115)
- 📦 `class` `SelectAction` (L124)
- 📦 `class` `SelectDateAction` (L129)
- 📦 `class` `BackAction` (L134)
- 📦 `class` `CancelAction` (L138)
- 📦 `class` `ConfirmYesAction` (L142)
- 📦 `class` `ConfirmNoAction` (L146)
- 📦 `class` `TransitionOutcome` (L160)

### `f/internal/booking_fsm/_fsm_responses.py`
- 📦 `class` `InlineButton` (L13)
- 🔧 `fn` `build_header` (L18)
- 🔧 `fn` `build_specialty_prompt` (L22)
- 🔧 `fn` `build_doctors_prompt` (L30)
- 🔧 `fn` `build_slots_prompt` (L38)
- 🔧 `fn` `build_confirmation_prompt` (L46)
- 🔧 `fn` `build_loading_doctors_prompt` (L51)
- 🔧 `fn` `build_loading_slots_prompt` (L55)
- 🔧 `fn` `chunk_buttons` (L64)
- 🔧 `fn` `build_specialty_keyboard` (L68)
- 🔧 `fn` `build_doctor_keyboard` (L74)
- 🔧 `fn` `build_time_slot_keyboard` (L81)
- 🔧 `fn` `build_confirmation_keyboard` (L88)

### `f/internal/booking_prefetch/main.py`
- 🔧 `fn` `main` (L255)

### `f/internal/client_register/main.py`
- 🔧 `fn` `main` (L77)

### `f/internal/conversation_get/_conversation_models.py`
- 📦 `class` `ConversationState` (L8)
- 📦 `class` `ConversationGetResult` (L21)

### `f/internal/conversation_get/main.py`
- 🔧 `fn` `main` (L71)

### `f/internal/conversation_update/_update_models.py`
- 📦 `class` `ConversationUpdateInput` (L8)
- 📦 `class` `ConversationUpdateResult` (L21)

### `f/internal/conversation_update/main.py`
- 🔧 `fn` `main` (L91)

### `f/internal/conversation_verify/_verify_models.py`
- 📦 `class` `PersistedConversationState` (L6)
- 📦 `class` `ConversationVerifyInput` (L19)
- 📦 `class` `ConversationVerifyResult` (L27)

### `f/internal/conversation_verify/main.py`
- 🔧 `fn` `main` (L58)

### `f/internal/debug_db.py`
- 🔧 `fn` `main` (L22)

### `f/internal/debug_db_final.py`
- 🔧 `fn` `main` (L17)

### `f/internal/gcal_utils/_gcal_logic.py`
- 🔧 `fn` `build_gcal_event` (L6)

### `f/internal/gcal_utils/_gcal_models.py`
- 📦 `class` `BookingEventData` (L4)
- 📦 `class` `GCalTime` (L13)
- 📦 `class` `GCalReminderOverride` (L18)
- 📦 `class` `GCalReminders` (L23)
- 📦 `class` `GoogleCalendarEvent` (L28)
- 📦 `class` `TokenInfo` (L37)

### `f/internal/gcal_utils/_oauth_logic.py`
- 📦 `class` `TokenResponse` (L8)
- ⚡ `async_fn` `get_valid_access_token` (L17)
- ⚡ `async_fn` `refresh_access_token` (L55)
- ⚡ `async_fn` `persist_new_token` (L84)

### `f/internal/intercept_debug/main.py`
- 🔧 `fn` `main` (L14)

### `f/internal/intercept_outbound/main.py`
- 🔧 `fn` `main` (L15)

### `f/internal/message_parser/main.py`
- 📦 `class` `ParserInput` (L20)
- 📦 `class` `ParserResult` (L26)
- 🔧 `fn` `main` (L45)

### `f/internal/scheduling_engine/_scheduling_logic.py`
- 🔧 `fn` `time_to_minutes` (L24)
- 🔧 `fn` `generate_slots_for_rule` (L32)
- ⚡ `async_fn` `get_availability` (L105)
- ⚡ `async_fn` `get_availability_range` (L260)
- ⚡ `async_fn` `validate_override` (L283)

### `f/internal/scheduling_engine/_scheduling_models.py`
- 📦 `class` `TimeSlot` (L4)
- 📦 `class` `AvailabilityQuery` (L10)
- 📦 `class` `AvailabilityResult` (L16)
- 📦 `class` `ScheduleOverrideRow` (L27)
- 📦 `class` `ProviderScheduleRow` (L37)
- 📦 `class` `BookingTimeRow` (L45)
- 📦 `class` `ServiceRow` (L50)
- 📦 `class` `AffectedBooking` (L56)
- 📦 `class` `OverrideValidation` (L62)

### `f/internal/seed_test_provider.py`
- 🔧 `fn` `main` (L97)

### `f/internal/telegram_classify/_classify_models.py`
- 📦 `class` `TelegramClassifyInput` (L8)
- 📦 `class` `TelegramClassifyResult` (L21)

### `f/internal/telegram_classify/main.py`
- 🔧 `fn` `main` (L68)

### `f/internal/telegram_deduplicate/main.py`
- 🔧 `fn` `main` (L56)

### `f/internal/telegram_normalize/_normalize_models.py`
- 📦 `class` `TelegramNormalizeInput` (L8)
- 📦 `class` `TelegramNormalizeResult` (L19)

### `f/internal/telegram_normalize/main.py`
- 🔧 `fn` `main` (L60)

### `f/internal/telegram_router/_router_models.py`
- 📦 `class` `RouterInput` (L8)
- 📦 `class` `RouterResult` (L23)

### `f/internal/telegram_router/_router_reminders.py`
- ⚡ `async_fn` `handle_reminders_config` (L27)

### `f/internal/telegram_router/main.py`
- 🔧 `fn` `main` (L490)

### `f/message_preprocessor/_modism_mapper.py`
- 🔧 `fn` `apply_modism_map` (L48)

### `f/message_preprocessor/_preprocessor_models.py`
- 📦 `class` `SpellCorrection` (L6)
- 📦 `class` `ModismMatch` (L13)
- 📦 `class` `PreprocessorInput` (L20)
- 📦 `class` `PreprocessorOutput` (L26)

### `f/message_preprocessor/_spell_normalizer.py`
- 🔧 `fn` `apply_spell_correction` (L100)

### `f/message_preprocessor/_text_cleaner.py`
- 🔧 `fn` `clean_text` (L18)

### `f/message_preprocessor/main.py`
- 🔧 `fn` `main` (L54)

### `f/nlu/_tfidf_classifier.py`
- 📦 `class` `ModelData` (L234)
- 📦 `class` `ScoreEntry` (L263)
- 📦 `class` `TfIdfResult` (L268)
- 🔧 `fn` `classify_intent` (L274)

### `f/nlu/main.py`
- 📦 `class` `ExtractedIntent` (L34)
- 🔧 `fn` `main` (L64)

### `f/noshow_trigger/_noshow_logic.py`
- 📦 `class` `BookingRepository` (L5)
- ⚡ `async_fn` `find_expired_confirmed` (L9)
- ⚡ `async_fn` `mark_as_no_show` (L25)

### `f/noshow_trigger/_noshow_models.py`
- 📦 `class` `NoShowStats` (L6)
- 📦 `class` `InputSchema` (L13)
- 📦 `class` `ProviderRow` (L20)

### `f/noshow_trigger/main.py`
- ⚡ `async_fn` `provider_batch` (L53)
- 🔧 `fn` `main` (L102)

### `f/openrouter_benchmark/_benchmark_logic.py`
- 🔧 `fn` `extract_json` (L42)
- ⚡ `async_fn` `run_benchmark_task` (L76)

### `f/openrouter_benchmark/_benchmark_models.py`
- 📦 `class` `ModelCandidate` (L6)
- 📦 `class` `NLUIntent` (L11)
- 📦 `class` `ModelTestResult` (L17)
- 📦 `class` `ModelSummary` (L29)
- 📦 `class` `BenchmarkReport` (L39)
- 📦 `class` `TaskPrompt` (L45)
- 📦 `class` `OpenRouterUsage` (L52)
- 📦 `class` `OpenRouterChoiceMessage` (L58)
- 📦 `class` `OpenRouterChoice` (L63)
- 📦 `class` `OpenRouterResponse` (L68)

### `f/openrouter_benchmark/main.py`
- 🔧 `fn` `main` (L83)

### `f/patient_register/_patient_logic.py`
- ⚡ `async_fn` `upsert_client` (L10)

### `f/patient_register/_patient_models.py`
- 📦 `class` `ClientResult` (L8)
- 📦 `class` `InputSchema` (L18)

### `f/patient_register/main.py`
- ⚡ `async_fn` `main_async` (L39)
- ⚡ `async_fn` `operation` (L62)
- 🔧 `fn` `main` (L77)

### `f/provider_agenda/_agenda_logic.py`
- ⚡ `async_fn` `get_provider_agenda` (L11)

### `f/provider_agenda/_agenda_models.py`
- 📦 `class` `AgendaRow` (L11)
- 📦 `class` `AgendaInput` (L21)
- 📦 `class` `AgendaBooking` (L27)
- 📦 `class` `AgendaDay` (L36)
- 📦 `class` `AgendaResult` (L44)
- 📦 `class` `InputSchema` (L52)

### `f/provider_agenda/main.py`
- ⚡ `async_fn` `operation` (L46)
- 🔧 `fn` `main` (L67)

### `f/provider_manage/_manage_logic.py`
- ⚡ `async_fn` `handle_provider_actions` (L11)
- ⚡ `async_fn` `handle_service_actions` (L72)
- ⚡ `async_fn` `handle_schedule_actions` (L142)
- ⚡ `async_fn` `handle_override_actions` (L188)

### `f/provider_manage/_manage_models.py`
- 📦 `class` `InputSchema` (L8)

### `f/provider_manage/main.py`
- ⚡ `async_fn` `operation` (L55)
- 🔧 `fn` `main` (L79)

### `f/rag_query/_rag_logic.py`
- 📦 `class` `KBRepository` (L10)
- ⚡ `async_fn` `fetch_active_entries` (L14)
- 📦 `class` `ScoredEntry` (L49)
- 🔧 `fn` `perform_keyword_search` (L54)

### `f/rag_query/_rag_models.py`
- 📦 `class` `KBEntry` (L6)
- 📦 `class` `RAGResult` (L14)
- 📦 `class` `KBRow` (L20)
- 📦 `class` `InputSchema` (L27)

### `f/rag_query/main.py`
- ⚡ `async_fn` `operation` (L46)
- 🔧 `fn` `main` (L69)

### `f/reminder_config/_config_models.py`
- 📦 `class` `InlineButton` (L8)
- 📦 `class` `ChannelPreferences` (L14)
- 📦 `class` `WindowPreferences` (L20)
- 📦 `class` `ReminderPreferences` (L31)
- 📦 `class` `ReminderConfigView` (L42)
- 📦 `class` `ReminderConfigResult` (L48)
- 📦 `class` `InputSchema` (L55)

### `f/reminder_config/_config_repository.py`
- ⚡ `async_fn` `load_preferences` (L13)
- ⚡ `async_fn` `save_preferences` (L35)

### `f/reminder_config/_config_service.py`
- 🔧 `fn` `default_preferences` (L25)
- 🔧 `fn` `parse_preferences_payload` (L29)
- 🔧 `fn` `toggle_channel` (L61)
- 🔧 `fn` `toggle_window` (L71)
- 🔧 `fn` `deactivate_all` (L91)
- 🔧 `fn` `activate_all` (L107)

### `f/reminder_config/_config_view.py`
- 🔧 `fn` `build_config_view` (L11)

### `f/reminder_config/main.py`
- ⚡ `async_fn` `run_reminder_config` (L38)
- ⚡ `async_fn` `operation` (L42)
- 🔧 `fn` `main` (L89)

### `f/reminder_cron/_delivery_service.py`
- 🔧 `fn` `dispatch_reminder` (L12)

### `f/reminder_cron/_reminder_logic.py`
- 🔧 `fn` `format_date_es` (L15)
- 🔧 `fn` `format_time_es` (L36)
- 🔧 `fn` `get_client_preference` (L40)
- 🔧 `fn` `build_booking_details` (L53)
- 🔧 `fn` `build_inline_buttons` (L66)
- 🔧 `fn` `build_reminder_message` (L87)

### `f/reminder_cron/_reminder_models.py`
- 📦 `class` `BookingDetails` (L18)
- 📦 `class` `BookingRecord` (L28)
- 📦 `class` `ReminderDispatchRecord` (L45)
- 📦 `class` `ReminderDispatchDecision` (L57)
- 📦 `class` `ReminderMessage` (L68)
- 📦 `class` `CronResult` (L75)
- 📦 `class` `InputSchema` (L84)

### `f/reminder_cron/_reminder_repository.py`
- ⚡ `async_fn` `get_candidates_between` (L14)
- ⚡ `async_fn` `claim_dispatch` (L43)
- ⚡ `async_fn` `persist_dispatch_decision` (L65)

### `f/reminder_cron/_window_policy.py`
- 🔧 `fn` `offset_window_ranges` (L20)
- 🔧 `fn` `one_day_candidate_range` (L27)
- 🔧 `fn` `scheduled_time_for_window` (L31)
- 🔧 `fn` `is_due` (L44)
- 🔧 `fn` `is_quiet_hours` (L51)

### `f/reminder_cron/main.py`
- 🔧 `fn` `main` (L185)

### `f/services/booking/_booking_errors.py`
- 📦 `class` `BookingNotFoundError` (L4)
- 📦 `class` `BookingAlreadyCancelledError` (L7)
- 📦 `class` `BookingAlreadyRescheduledError` (L10)
- 📦 `class` `BookingSlotUnavailableError` (L13)
- 📦 `class` `BookingPermissionError` (L16)

### `f/services/booking/_booking_models.py`
- 📦 `class` `BookingCreateRequest` (L9)
- 📦 `class` `BookingCancelRequest` (L20)
- 📦 `class` `BookingRescheduleRequest` (L28)
- 📦 `class` `BookingResult` (L37)

### `f/services/booking/adapters.py`
- 📦 `class` `CalendarPort` (L10)
- ⚡ `async_fn` `sync` (L11)
- 📦 `class` `NotifierPort` (L14)
- ⚡ `async_fn` `send` (L15)
- 📦 `class` `RedisBookingRepo` (L18)
- ⚡ `async_fn` `get_state` (L22)
- ⚡ `async_fn` `set_state` (L26)
- ⚡ `async_fn` `is_duplicate` (L29)
- 📦 `class` `GCalClient` (L34)
- ⚡ `async_fn` `sync` (L35)
- 📦 `class` `TelegramClient` (L39)
- ⚡ `async_fn` `send` (L40)

### `f/services/booking/core.py`
- ⚡ `async_fn` `create_booking` (L23)
- ⚡ `async_fn` `cancel_booking` (L41)
- ⚡ `async_fn` `reschedule_booking` (L63)

### `f/services/booking/fsm.py`
- 🔧 `fn` `get_main_menu_text` (L31)
- 🔧 `fn` `parse_action` (L43)
- 🔧 `fn` `parse_callback_data` (L61)
- 🔧 `fn` `apply_transition` (L78)

### `f/services/booking/models.py`
- 📦 `class` `NamedItem` (L8)
- 📦 `class` `TimeSlotItem` (L13)
- 📦 `class` `DraftCore` (L19)
- 📦 `class` `DraftBooking` (L30)
- 📦 `class` `IdleState` (L37)
- 📦 `class` `SelectingSpecialtyState` (L41)
- 📦 `class` `SelectingDoctorState` (L47)
- 📦 `class` `SelectingTimeState` (L55)
- 📦 `class` `ConfirmingState` (L65)
- 📦 `class` `CompletedState` (L75)
- 📦 `class` `BookingStateRoot` (L85)
- 📦 `class` `BackAction` (L89)
- 📦 `class` `CancelAction` (L93)
- 📦 `class` `SelectAction` (L97)
- 📦 `class` `SelectDateAction` (L102)
- 📦 `class` `ConfirmYesAction` (L107)
- 📦 `class` `ConfirmNoAction` (L111)
- 📦 `class` `TransitionOutcome` (L121)

### `f/services/booking/nlu.py`
- 📦 `class` `ModelData` (L188)
- 📦 `class` `TfIdfResult` (L209)
- 🔧 `fn` `classify_intent` (L214)

### `f/services/booking/orchestrator.py`
- ⚡ `async_fn` `route_intent` (L348)

### `f/services/booking/repo.py`
- 🔧 `fn` `get_entity` (L27)
- 📦 `class` `BookingRepo` (L34)
- ⚡ `async_fn` `resolve_context` (L35)
- ⚡ `async_fn` `exists` (L36)
- ⚡ `async_fn` `get_by_key` (L37)
- ⚡ `async_fn` `is_available` (L38)
- ⚡ `async_fn` `insert` (L39)
- ⚡ `async_fn` `get_specialties_for_booking` (L40)
- ⚡ `async_fn` `get_active_booking_for_client` (L41)
- ⚡ `async_fn` `get_booking` (L42)
- ⚡ `async_fn` `update_status` (L43)
- ⚡ `async_fn` `reschedule` (L51)
- 📦 `class` `PgBookingRepo` (L54)
- ⚡ `async_fn` `resolve_context` (L69)
- ⚡ `async_fn` `get_specialties_for_booking` (L158)
- ⚡ `async_fn` `get_active_booking_for_client` (L176)
- ⚡ `async_fn` `exists` (L190)
- ⚡ `async_fn` `get_by_key` (L198)
- ⚡ `async_fn` `get_booking` (L205)
- ⚡ `async_fn` `is_available` (L212)
- ⚡ `async_fn` `insert` (L284)
- ⚡ `async_fn` `update_status` (L355)
- ⚡ `async_fn` `reschedule` (L432)

### `f/telegram_auto_register/_auto_register_logic.py`
- ⚡ `async_fn` `register_telegram_user` (L10)

### `f/telegram_auto_register/_auto_register_models.py`
- 📦 `class` `RegisterResult` (L6)
- 📦 `class` `InputSchema` (L14)

### `f/telegram_auto_register/main.py`
- ⚡ `async_fn` `operation` (L48)
- 🔧 `fn` `main` (L63)

### `f/telegram_callback/_callback_logic.py`
- 🔧 `fn` `parse_callback_data` (L31)
- ⚡ `async_fn` `confirm_booking` (L55)
- ⚡ `async_fn` `update_booking_status` (L86)
- ⚡ `async_fn` `answer_callback_query` (L126)
- ⚡ `async_fn` `send_followup_message` (L142)

### `f/telegram_callback/_callback_models.py`
- 📦 `class` `InputSchema` (L8)
- 📦 `class` `ActionContext` (L19)
- 📦 `class` `ActionResult` (L30)
- 📦 `class` `ActionHandler` (L35)
- ⚡ `async_fn` `handle` (L36)

### `f/telegram_callback/_callback_router.py`
- 📦 `class` `ConfirmHandler` (L8)
- ⚡ `async_fn` `handle` (L9)
- ⚡ `async_fn` `operation` (L13)
- 📦 `class` `CancelHandler` (L37)
- ⚡ `async_fn` `handle` (L38)
- ⚡ `async_fn` `operation` (L42)
- 📦 `class` `AcknowledgeHandler` (L68)
- ⚡ `async_fn` `handle` (L69)
- 📦 `class` `AutoRescheduleHandler` (L73)
- ⚡ `async_fn` `handle` (L74)
- 📦 `class` `TelegramRouter` (L115)
- 🔧 `fn` `register` (L119)
- ⚡ `async_fn` `route` (L122)

### `f/telegram_callback/main.py`
- 🔧 `fn` `main` (L104)

### `f/telegram_gateway/_gateway_logic.py`
- 📦 `class` `TelegramClient` (L13)
- ⚡ `async_fn` `send_message` (L18)
- 📦 `class` `ClientRepository` (L48)
- ⚡ `async_fn` `ensure_registered` (L52)

### `f/telegram_gateway/_gateway_models.py`
- 📦 `class` `TelegramUser` (L12)
- 📦 `class` `TelegramChat` (L21)
- 📦 `class` `TelegramMessage` (L27)
- 📦 `class` `TelegramCallback` (L36)
- 📦 `class` `TelegramUpdate` (L44)
- 📦 `class` `SendMessageOptions` (L51)

### `f/telegram_gateway/main.py`
- 📦 `class` `TelegramRouter` (L25)
- ⚡ `async_fn` `route_update` (L30)
- ⚡ `async_fn` `handle_callback` (L37)
- ⚡ `async_fn` `handle_message` (L49)
- 🔧 `fn` `main` (L110)

### `f/telegram_menu/_menu_logic.py`
- 🔧 `fn` `parse_user_option` (L13)
- 📦 `class` `MenuController` (L22)
- ⚡ `async_fn` `handle` (L23)

### `f/telegram_menu/_menu_models.py`
- 📦 `class` `InlineButton` (L6)
- 📦 `class` `MenuInput` (L12)
- 📦 `class` `MenuResponse` (L19)
- 📦 `class` `InputSchema` (L26)
- 📦 `class` `MenuResult` (L30)

### `f/telegram_menu/main.py`
- 🔧 `fn` `main` (L54)

### `f/telegram_send/_telegram_logic.py`
- 📦 `class` `TelegramService` (L21)
- ⚡ `async_fn` `execute` (L26)
- 🔧 `fn` `prepare_request` (L52)
- ⚡ `async_fn` `api_call` (L90)
- 🔧 `fn` `normalize_keyboard` (L108)

### `f/telegram_send/_telegram_models.py`
- 📦 `class` `InlineButton` (L12)
- 📦 `class` `BaseTelegramInput` (L18)
- 📦 `class` `SendMessageInput` (L24)
- 📦 `class` `EditMessageInput` (L31)
- 📦 `class` `DeleteMessageInput` (L38)
- 📦 `class` `AnswerCallbackInput` (L49)
- 📦 `class` `TelegramInputRoot` (L67)
- 📦 `class` `TelegramResponseResult` (L71)
- 📦 `class` `TelegramResponse` (L75)
- 📦 `class` `TelegramSendData` (L83)

### `f/telegram_send/main.py`
- 🔧 `fn` `main` (L83)

### `f/web_admin_dashboard/_dashboard_logic.py`
- ⚡ `async_fn` `fetch_dashboard_stats` (L10)

### `f/web_admin_dashboard/_dashboard_models.py`
- 📦 `class` `AdminDashboardResult` (L6)
- 📦 `class` `InputSchema` (L15)

### `f/web_admin_dashboard/main.py`
- ⚡ `async_fn` `operation` (L46)
- 🔧 `fn` `main` (L58)

### `f/web_admin_provider_crud/_provider_logic.py`
- 🔧 `fn` `map_row_to_provider` (L10)
- ⚡ `async_fn` `list_providers` (L42)
- ⚡ `async_fn` `create_provider` (L67)
- ⚡ `async_fn` `update_provider` (L107)
- ⚡ `async_fn` `reset_provider_password` (L162)

### `f/web_admin_provider_crud/_provider_models.py`
- 📦 `class` `ProviderRow` (L6)
- 📦 `class` `CreateProviderResult` (L35)
- 📦 `class` `InputSchema` (L39)

### `f/web_admin_provider_crud/main.py`
- ⚡ `async_fn` `create_op` (L55)
- ⚡ `async_fn` `operation` (L65)
- 🔧 `fn` `main` (L93)

### `f/web_admin_regions/_regions_logic.py`
- ⚡ `async_fn` `list_regions` (L9)
- ⚡ `async_fn` `list_communes` (L29)
- ⚡ `async_fn` `search_communes` (L65)

### `f/web_admin_regions/_regions_models.py`
- 📦 `class` `RegionRow` (L6)
- 📦 `class` `CommuneRow` (L14)
- 📦 `class` `InputSchema` (L22)

### `f/web_admin_regions/main.py`
- 🔧 `fn` `main` (L64)

### `f/web_admin_specialties_crud/_specialty_logic.py`
- 🔧 `fn` `map_row` (L8)
- ⚡ `async_fn` `list_specialties` (L22)
- ⚡ `async_fn` `create_specialty` (L30)
- ⚡ `async_fn` `update_specialty` (L52)
- ⚡ `async_fn` `delete_specialty` (L82)
- ⚡ `async_fn` `set_status` (L90)

### `f/web_admin_specialties_crud/_specialty_models.py`
- 📦 `class` `SpecialtyRow` (L6)
- 📦 `class` `InputSchema` (L16)

### `f/web_admin_specialties_crud/main.py`
- ⚡ `async_fn` `operation` (L48)
- 🔧 `fn` `main` (L77)

### `f/web_admin_tags/_tags_logic.py`
- 🔧 `fn` `map_category` (L8)
- 🔧 `fn` `map_tag` (L22)
- ⚡ `async_fn` `verify_admin_access` (L38)
- 📦 `class` `TagRepository` (L47)
- ⚡ `async_fn` `list_categories` (L51)
- ⚡ `async_fn` `create_category` (L67)
- ⚡ `async_fn` `update_category` (L81)
- ⚡ `async_fn` `set_category_status` (L106)
- ⚡ `async_fn` `delete_category` (L119)
- ⚡ `async_fn` `list_tags` (L126)
- ⚡ `async_fn` `create_tag` (L150)
- ⚡ `async_fn` `update_tag` (L172)
- ⚡ `async_fn` `set_tag_status` (L203)
- ⚡ `async_fn` `delete_tag` (L216)

### `f/web_admin_tags/_tags_models.py`
- 📦 `class` `CategoryRow` (L6)
- 📦 `class` `TagRow` (L16)
- 📦 `class` `InputSchema` (L28)

### `f/web_admin_tags/main.py`
- ⚡ `async_fn` `operation` (L48)
- 🔧 `fn` `main` (L115)

### `f/web_admin_users/_user_logic.py`
- 🔧 `fn` `map_row` (L8)
- ⚡ `async_fn` `handle_user_actions` (L29)

### `f/web_admin_users/_user_models.py`
- 📦 `class` `UserInfo` (L6)
- 📦 `class` `UsersListResult` (L19)
- 📦 `class` `InputSchema` (L24)

### `f/web_admin_users/main.py`
- ⚡ `async_fn` `operation` (L48)
- 🔧 `fn` `main` (L70)

### `f/web_auth_change_role/_change_role_models.py`
- 📦 `class` `ChangeRoleResult` (L6)
- 📦 `class` `InputSchema` (L13)

### `f/web_auth_change_role/main.py`
- ⚡ `async_fn` `operation` (L47)
- 🔧 `fn` `main` (L107)

### `f/web_auth_complete_profile/_complete_profile_models.py`
- 📦 `class` `CompleteProfileResult` (L6)
- 📦 `class` `UserRow` (L14)
- 📦 `class` `InputSchema` (L22)

### `f/web_auth_complete_profile/main.py`
- ⚡ `async_fn` `operation` (L59)
- 🔧 `fn` `main` (L137)

### `f/web_auth_login/_login_logic.py`
- 🔧 `fn` `verify_password_sync` (L5)

### `f/web_auth_login/_login_models.py`
- 📦 `class` `LoginResult` (L6)
- 📦 `class` `UserRow` (L14)
- 📦 `class` `InputSchema` (L24)

### `f/web_auth_login/main.py`
- ⚡ `async_fn` `operation` (L48)
- 🔧 `fn` `main` (L109)

### `f/web_auth_me/_me_logic.py`
- ⚡ `async_fn` `get_user_profile` (L7)

### `f/web_auth_me/_me_models.py`
- 📦 `class` `UserProfileResult` (L6)
- 📦 `class` `InputSchema` (L21)

### `f/web_auth_me/main.py`
- ⚡ `async_fn` `operation` (L48)
- 🔧 `fn` `main` (L62)

### `f/web_auth_register/_register_logic.py`
- 🔧 `fn` `validate_rut` (L7)
- 🔧 `fn` `validate_password_strength` (L32)
- 🔧 `fn` `hash_password_sync` (L44)

### `f/web_auth_register/_register_models.py`
- 📦 `class` `RegisterResult` (L6)
- 📦 `class` `InputSchema` (L13)

### `f/web_auth_register/main.py`
- ⚡ `async_fn` `operation` (L58)
- 🔧 `fn` `main` (L113)

### `f/web_booking_api/_booking_logic.py`
- 🔧 `fn` `derive_idempotency_key` (L8)
- 🔧 `fn` `calculate_end_time` (L13)
- 📦 `class` `BookingRepository` (L22)
- ⚡ `async_fn` `resolve_tenant_for_booking` (L26)
- ⚡ `async_fn` `resolve_client_id` (L32)
- ⚡ `async_fn` `lock_provider` (L49)
- ⚡ `async_fn` `get_service_duration` (L58)
- ⚡ `async_fn` `check_overlap` (L66)
- ⚡ `async_fn` `insert_booking` (L85)
- ⚡ `async_fn` `get_booking` (L111)
- ⚡ `async_fn` `update_status` (L123)

### `f/web_booking_api/_booking_models.py`
- 📦 `class` `BookingResult` (L6)
- 📦 `class` `InputSchema` (L12)

### `f/web_booking_api/main.py`
- ⚡ `async_fn` `operation` (L61)
- 🔧 `fn` `main` (L152)

### `f/web_patient_bookings/_bookings_logic.py`
- ⚡ `async_fn` `resolve_client_id` (L11)
- ⚡ `async_fn` `get_patient_bookings` (L31)

### `f/web_patient_bookings/_bookings_models.py`
- 📦 `class` `BookingInfo` (L6)
- 📦 `class` `BookingsResult` (L19)
- 📦 `class` `InputSchema` (L25)

### `f/web_patient_bookings/main.py`
- ⚡ `async_fn` `operation` (L48)
- 🔧 `fn` `main` (L65)

### `f/web_patient_profile/_profile_logic.py`
- 🔧 `fn` `map_to_profile` (L7)
- ⚡ `async_fn` `find_user` (L19)
- ⚡ `async_fn` `find_or_create_client` (L29)
- ⚡ `async_fn` `update_profile` (L55)

### `f/web_patient_profile/_profile_models.py`
- 📦 `class` `ProfileResult` (L6)
- 📦 `class` `InputSchema` (L16)

### `f/web_patient_profile/main.py`
- ⚡ `async_fn` `operation` (L48)
- 🔧 `fn` `main` (L77)

### `f/web_provider_dashboard/_provider_dashboard_logic.py`
- ⚡ `async_fn` `fetch_provider_dashboard` (L7)

### `f/web_provider_dashboard/_provider_dashboard_models.py`
- 📦 `class` `AgendaItem` (L6)
- 📦 `class` `ProviderStats` (L16)
- 📦 `class` `DashboardResult` (L24)
- 📦 `class` `InputSchema` (L32)

### `f/web_provider_dashboard/main.py`
- ⚡ `async_fn` `operation` (L48)
- 🔧 `fn` `main` (L61)

### `f/web_provider_notes/_notes_logic.py`
- 🔧 `fn` `decrypt_content` (L9)
- 🔧 `fn` `map_row_to_note` (L21)
- 📦 `class` `NoteRepository` (L43)
- ⚡ `async_fn` `get_tags` (L47)
- ⚡ `async_fn` `assign_tags` (L60)
- ⚡ `async_fn` `create` (L71)
- ⚡ `async_fn` `read` (L100)
- ⚡ `async_fn` `list_notes` (L111)
- ⚡ `async_fn` `delete` (L143)

### `f/web_provider_notes/_notes_models.py`
- 📦 `class` `Tag` (L6)
- 📦 `class` `NoteRow` (L12)
- 📦 `class` `InputSchema` (L25)

### `f/web_provider_notes/main.py`
- ⚡ `async_fn` `operation` (L48)
- 🔧 `fn` `main` (L88)

### `f/web_provider_profile/_profile_logic.py`
- 📦 `class` `ProfileRepository` (L7)
- ⚡ `async_fn` `find_by_id` (L11)
- ⚡ `async_fn` `update` (L65)
- ⚡ `async_fn` `get_password_hash` (L101)
- ⚡ `async_fn` `update_password` (L110)

### `f/web_provider_profile/_profile_models.py`
- 📦 `class` `ProfileRow` (L6)
- 📦 `class` `InputSchema` (L28)

### `f/web_provider_profile/main.py`
- ⚡ `async_fn` `operation` (L49)
- 🔧 `fn` `main` (L94)

### `f/web_waitlist/_waitlist_logic.py`
- ⚡ `async_fn` `resolve_client_id` (L8)
- ⚡ `async_fn` `handle_join` (L27)
- ⚡ `async_fn` `handle_leave` (L78)
- ⚡ `async_fn` `handle_list` (L98)
- ⚡ `async_fn` `handle_check_position` (L127)

### `f/web_waitlist/_waitlist_models.py`
- 📦 `class` `WaitlistEntry` (L6)
- 📦 `class` `WaitlistResult` (L16)
- 📦 `class` `InputSchema` (L22)

### `f/web_waitlist/main.py`
- ⚡ `async_fn` `operation` (L50)
- 🔧 `fn` `main` (L77)

## Windmill Scripts

- `f/__init__.script.yaml`
- `f/admin_honorifics/_honorifics_logic.script.yaml`
- `f/admin_honorifics/_honorifics_models.script.yaml`
- `f/admin_honorifics/main.script.yaml`
- `f/admin_schedule_seed/main.script.yaml`
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
- `f/internal/_booking_utils.script.yaml`
- `f/internal/_config.script.yaml`
- `f/internal/_date_resolver.script.yaml`
- `f/internal/_db_client.script.yaml`
- `f/internal/_nlu_cache.script.yaml`
- `f/internal/_redis_client.script.yaml`
- `f/internal/_wmill_adapter.script.yaml`
- `f/internal/ai_agent/_ai_agent_logic.script.yaml`
- `f/internal/ai_agent/_constants.script.yaml`
- `f/internal/ai_agent/_guardrails.script.yaml`
- `f/internal/ai_agent/_tfidf_classifier.script.yaml`
- `f/internal/apply_fix_migration.script.yaml`
- `f/internal/booking_confirm/main.script.yaml`
- `f/internal/booking_fsm/_fsm_machine.script.yaml`
- `f/internal/booking_fsm/_fsm_models.script.yaml`
- `f/internal/booking_prefetch/main.script.yaml`
- `f/internal/client_register/main.script.yaml`
- `f/internal/conversation_verify/main.script.yaml`
- `f/internal/debug_schedules.script.yaml`
- `f/internal/intercept_debug/main.script.yaml`
- `f/internal/intercept_outbound/main.script.yaml`
- `f/internal/scheduling_engine/_scheduling_logic.script.yaml`
- `f/internal/seed_test_schedules.script.yaml`
- `f/internal/telegram_classify/main.script.yaml`
- `f/internal/telegram_normalize/main.script.yaml`
- `f/internal/telegram_router/_router_models.script.yaml`
- `f/internal/telegram_router/_router_reminders.script.yaml`
- `f/internal/telegram_router/main.script.yaml`
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
- `f/reminder_config/_config_repository.script.yaml`
- `f/reminder_config/_config_service.script.yaml`
- `f/reminder_config/_config_view.script.yaml`
- `f/reminder_config/main.script.yaml`
- `f/reminder_cron/_delivery_service.script.yaml`
- `f/reminder_cron/_reminder_logic.script.yaml`
- `f/reminder_cron/_reminder_models.script.yaml`
- `f/reminder_cron/_reminder_repository.script.yaml`
- `f/reminder_cron/_window_policy.script.yaml`
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

