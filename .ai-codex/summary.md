# Codebase Index
_git:ae4e0cba — 2026-04-26T22:10Z_

> Read this file BEFORE exploring the repository.

## Module Map

### `f/admin_honorifics/_honorifics_logic.py`
- 🔧 `fn` `map_row` (L13)
- ⚡ `async_fn` `list_honorifics` (L29)
- ⚡ `async_fn` `create_honorific` (L38)
- ⚡ `async_fn` `update_honorific` (L62)
- ⚡ `async_fn` `delete_honorific` (L114)

### `f/admin_honorifics/_honorifics_models.py`
- 📦 `class` `HonorificRow` (L8)
- 📦 `class` `InputSchema` (L20)

### `f/admin_honorifics/main.py`
- ⚡ `async_fn` `list_op` (L43)
- ⚡ `async_fn` `operation` (L48)
- ⚡ `async_fn` `main` (L90)

### `f/auth_provider/_auth_logic.py`
- 🔧 `fn` `generate_readable_password` (L15)
- ⚡ `async_fn` `admin_generate_temp_password` (L20)
- ⚡ `async_fn` `provider_change_password` (L54)
- ⚡ `async_fn` `provider_verify` (L90)

### `f/auth_provider/_auth_models.py`
- 📦 `class` `TempPasswordResult` (L4)
- 📦 `class` `PasswordChangeResult` (L11)
- 📦 `class` `VerifyResult` (L15)
- 📦 `class` `InputSchema` (L20)

### `f/auth_provider/main.py`
- ⚡ `async_fn` `operation` (L40)
- ⚡ `async_fn` `main` (L59)

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
- ⚡ `async_fn` `main` (L75)

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
- ⚡ `async_fn` `operation` (L60)
- ⚡ `async_fn` `main` (L96)

### `f/booking_create/_booking_create_models.py`
- 📦 `class` `InputSchema` (L6)
- 🔧 `fn` `parse_datetime` (L20)
- 📦 `class` `BookingCreated` (L28)
- 📦 `class` `ClientContext` (L37)
- 📦 `class` `ProviderContext` (L41)
- 📦 `class` `ServiceContext` (L46)
- 📦 `class` `BookingContext` (L51)

### `f/booking_create/_booking_create_repository.py`
- 📦 `class` `BookingCreateRepository` (L14)
- ⚡ `async_fn` `get_client_context` (L15)
- ⚡ `async_fn` `get_provider_context` (L16)
- ⚡ `async_fn` `get_service_context` (L17)
- ⚡ `async_fn` `is_provider_blocked` (L18)
- ⚡ `async_fn` `is_provider_scheduled` (L19)
- ⚡ `async_fn` `has_overlapping_booking` (L20)
- ⚡ `async_fn` `insert_booking` (L21)
- 📦 `class` `PostgresBookingCreateRepository` (L31)
- ⚡ `async_fn` `get_client_context` (L35)
- ⚡ `async_fn` `get_provider_context` (L44)
- ⚡ `async_fn` `get_service_context` (L62)
- ⚡ `async_fn` `is_provider_blocked` (L82)
- ⚡ `async_fn` `is_provider_scheduled` (L96)
- ⚡ `async_fn` `has_overlapping_booking` (L110)
- ⚡ `async_fn` `insert_booking` (L126)

### `f/booking_create/_create_booking_logic.py`
- ⚡ `async_fn` `fetch_booking_context` (L8)
- ⚡ `async_fn` `check_availability` (L30)
- ⚡ `async_fn` `persist_booking` (L61)
- ⚡ `async_fn` `execute_create_booking` (L85)

### `f/booking_create/main.py`
- ⚡ `async_fn` `main_async` (L24)
- ⚡ `async_fn` `operation` (L42)
- ⚡ `async_fn` `main` (L75)

### `f/booking_orchestrator/_context_resolver.py`
- ⚡ `async_fn` `resolve_context` (L16)

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
- ⚡ `async_fn` `operation` (L31)

### `f/booking_orchestrator/handlers/_list_available.py`
- ⚡ `async_fn` `handle_list_available` (L18)

### `f/booking_orchestrator/handlers/_reschedule.py`
- ⚡ `async_fn` `handle_reschedule` (L19)

### `f/booking_orchestrator/main.py`
- ⚡ `async_fn` `main` (L86)

### `f/booking_reschedule/_reschedule_logic.py`
- 🔧 `fn` `authorize` (L7)
- ⚡ `async_fn` `execute_reschedule_logic` (L16)

### `f/booking_reschedule/_reschedule_models.py`
- 📦 `class` `RescheduleInput` (L7)
- 🔧 `fn` `parse_datetime` (L20)
- 📦 `class` `RescheduleResult` (L28)
- 📦 `class` `RescheduleWriteResult` (L37)
- 📦 `class` `BookingRow` (L45)
- 📦 `class` `ServiceRow` (L55)

### `f/booking_reschedule/_reschedule_repository.py`
- 📦 `class` `RescheduleRepository` (L9)
- ⚡ `async_fn` `fetch_booking` (L10)
- ⚡ `async_fn` `fetch_service` (L11)
- ⚡ `async_fn` `check_overlap` (L12)
- ⚡ `async_fn` `execute_reschedule` (L13)
- 📦 `class` `PostgresRescheduleRepository` (L15)
- ⚡ `async_fn` `fetch_booking` (L19)
- ⚡ `async_fn` `fetch_service` (L42)
- ⚡ `async_fn` `check_overlap` (L59)
- ⚡ `async_fn` `execute_reschedule` (L77)

### `f/booking_reschedule/main.py`
- ⚡ `async_fn` `main_async` (L26)
- ⚡ `async_fn` `operation` (L69)
- ⚡ `async_fn` `main` (L103)

### `f/booking_search/_search_logic.py`
- ⚡ `async_fn` `execute_search` (L7)

### `f/booking_search/_search_models.py`
- 📦 `class` `SearchInput` (L4)
- 📦 `class` `BookingSearchRow` (L16)
- 📦 `class` `BookingSearchResult` (L27)

### `f/booking_search/main.py`
- ⚡ `async_fn` `main` (L65)

### `f/booking_wizard/_wizard_logic.py`
- 📦 `class` `DateUtils` (L13)
- 🔧 `fn` `format_es` (L15)
- 🔧 `fn` `get_week_dates` (L22)
- 🔧 `fn` `generate_time_slots` (L38)
- 📦 `class` `WizardUI` (L45)
- 🔧 `fn` `build_date_selection` (L47)
- 🔧 `fn` `build_time_selection` (L68)
- 🔧 `fn` `build_confirmation` (L83)
- 📦 `class` `WizardRepository` (L92)
- ⚡ `async_fn` `get_service_duration` (L96)
- ⚡ `async_fn` `get_available_slots` (L101)
- ⚡ `async_fn` `get_names` (L124)
- ⚡ `async_fn` `create_booking` (L130)

### `f/booking_wizard/_wizard_models.py`
- 📦 `class` `WizardState` (L6)
- 📦 `class` `StepView` (L15)
- 📦 `class` `InputSchema` (L22)
- 📦 `class` `WizardResult` (L32)

### `f/booking_wizard/main.py`
- ⚡ `async_fn` `operation` (L43)
- ⚡ `async_fn` `main` (L148)

### `f/circuit_breaker/_circuit_logic.py`
- ⚡ `async_fn` `get_state` (L7)
- 🔧 `fn` `to_iso` (L26)
- ⚡ `async_fn` `init_service` (L49)

### `f/circuit_breaker/_circuit_models.py`
- 📦 `class` `CircuitState` (L4)
- 📦 `class` `CircuitBreakerResult` (L18)
- 📦 `class` `InputSchema` (L27)

### `f/circuit_breaker/main.py`
- ⚡ `async_fn` `operation` (L33)
- ⚡ `async_fn` `main` (L105)

### `f/conversation_logger/_logger_logic.py`
- ⚡ `async_fn` `persist_log` (L7)

### `f/conversation_logger/_logger_models.py`
- 📦 `class` `LogResult` (L5)
- 📦 `class` `InputSchema` (L8)

### `f/conversation_logger/main.py`
- ⚡ `async_fn` `operation` (L34)
- ⚡ `async_fn` `main` (L46)

### `f/distributed_lock/_lock_logic.py`
- 🔧 `fn` `map_row_to_lock_info` (L7)
- 🔧 `fn` `to_iso` (L9)
- ⚡ `async_fn` `acquire_lock` (L24)
- ⚡ `async_fn` `release_lock` (L66)
- ⚡ `async_fn` `check_lock` (L82)
- ⚡ `async_fn` `cleanup_locks` (L100)

### `f/distributed_lock/_lock_models.py`
- 📦 `class` `LockInfo` (L5)
- 📦 `class` `LockResult` (L14)
- 📦 `class` `LockRow` (L24)
- 📦 `class` `InputSchema` (L33)

### `f/distributed_lock/main.py`
- ⚡ `async_fn` `operation` (L35)
- ⚡ `async_fn` `main` (L56)

### `f/dlq_processor/_dlq_logic.py`
- 🔧 `fn` `map_row_to_dlq_entry` (L8)
- 🔧 `fn` `to_iso` (L11)
- ⚡ `async_fn` `list_dlq` (L45)
- ⚡ `async_fn` `retry_dlq` (L60)
- ⚡ `async_fn` `resolve_dlq` (L94)
- ⚡ `async_fn` `discard_dlq` (L111)
- ⚡ `async_fn` `get_dlq_status_stats` (L127)

### `f/dlq_processor/_dlq_models.py`
- 📦 `class` `DLQEntry` (L5)
- 📦 `class` `DLQListResult` (L22)
- 📦 `class` `InputSchema` (L26)

### `f/dlq_processor/main.py`
- ⚡ `async_fn` `operation` (L33)
- ⚡ `async_fn` `main` (L60)

### `f/gcal_reconcile/_reconcile_logic.py`
- ⚡ `async_fn` `retry_with_backoff` (L14)
- ⚡ `async_fn` `call_gcal_api` (L34)
- ⚡ `async_fn` `sync_booking_to_gcal` (L68)
- ⚡ `async_fn` `sync_op` (L93)
- ⚡ `async_fn` `sync_op_cli` (L108)

### `f/gcal_reconcile/_reconcile_models.py`
- 📦 `class` `InputSchema` (L5)
- 📦 `class` `ReconcileResult` (L13)
- 📦 `class` `BookingRow` (L21)
- 📦 `class` `SyncResult` (L35)

### `f/gcal_reconcile/main.py`
- ⚡ `async_fn` `provider_batch` (L42)
- ⚡ `async_fn` `main` (L145)

### `f/gcal_sync/_gcal_api_adapter.py`
- ⚡ `async_fn` `fetch_booking_details` (L10)
- ⚡ `async_fn` `operation` (L11)
- ⚡ `async_fn` `call_gcal_api` (L58)

### `f/gcal_sync/_gcal_sync_models.py`
- 📦 `class` `GCalSyncResult` (L5)
- 📦 `class` `BookingDetails` (L13)
- 📦 `class` `InputSchema` (L24)

### `f/gcal_sync/_sync_event_logic.py`
- ⚡ `async_fn` `sync_event` (L8)

### `f/gcal_sync/_update_sync_status.py`
- ⚡ `async_fn` `update_booking_sync_status` (L4)
- ⚡ `async_fn` `operation` (L15)

### `f/gcal_sync/main.py`
- ⚡ `async_fn` `main` (L88)

### `f/gmail_send/_gmail_logic.py`
- 🔧 `fn` `safe_string` (L10)
- 🔧 `fn` `build_email_content` (L15)
- ⚡ `async_fn` `send_with_retry` (L113)
- 🔧 `fn` `do_send` (L126)

### `f/gmail_send/_gmail_models.py`
- 📦 `class` `ActionLink` (L5)
- 📦 `class` `GmailSendData` (L11)
- 📦 `class` `InputSchema` (L18)

### `f/gmail_send/main.py`
- ⚡ `async_fn` `main` (L83)

### `f/health_check/_health_logic.py`
- ⚡ `async_fn` `check_database` (L10)
- ⚡ `async_fn` `check_gcal` (L22)
- ⚡ `async_fn` `check_telegram` (L41)
- 🔧 `fn` `check_gmail` (L57)

### `f/health_check/_health_models.py`
- 📦 `class` `ComponentStatus` (L5)
- 📦 `class` `HealthResult` (L11)
- 📦 `class` `InputSchema` (L16)

### `f/health_check/main.py`
- ⚡ `async_fn` `main` (L68)

### `f/internal/_config.py`
- 🔧 `fn` `get_env` (L55)
- 🔧 `fn` `require_env` (L58)
- 🔧 `fn` `require_database_url` (L64)

### `f/internal/_crypto.py`
- 🔧 `fn` `hash_password` (L24)
- 🔧 `fn` `verify_password` (L32)
- 📦 `class` `PasswordPolicyResult` (L49)
- 🔧 `fn` `validate_password_policy` (L54)
- 🔧 `fn` `get_encryption_key` (L84)
- 🔧 `fn` `encrypt_data` (L94)
- 🔧 `fn` `decrypt_data` (L104)

### `f/internal/_date_resolver.py`
- 📦 `class` `ResolveDateOpts` (L18)
- 🔧 `fn` `resolve_date` (L75)
- 🔧 `fn` `resolve_time` (L133)
- 🔧 `fn` `today_ymd` (L159)

### `f/internal/_db_client.py`
- ⚡ `async_fn` `create_db_client` (L21)
- 📦 `class` `AsyncpgWrapper` (L31)
- ⚡ `async_fn` `fetch` (L35)
- ⚡ `async_fn` `fetchrow` (L41)
- ⚡ `async_fn` `fetchval` (L46)
- ⚡ `async_fn` `execute` (L51)
- ⚡ `async_fn` `close` (L56)

### `f/internal/_file_lock.py`
- 📦 `class` `FileLockError` (L17)
- 🔧 `fn` `exclusive_file_lock` (L23)
- 🔧 `fn` `shared_file_lock` (L92)

### `f/internal/_result.py`
- 🔧 `fn` `ok` (L20)
- 🔧 `fn` `fail` (L25)
- 🔧 `fn` `is_ok` (L31)
- 🔧 `fn` `is_fail` (L36)
- ⚡ `async_fn` `wrap` (L41)
- 📦 `class` `DBClient` (L50)
- ⚡ `async_fn` `fetch` (L53)
- ⚡ `async_fn` `fetchrow` (L56)
- ⚡ `async_fn` `fetchval` (L59)
- ⚡ `async_fn` `execute` (L62)
- ⚡ `async_fn` `close` (L65)
- ⚡ `async_fn` `with_tenant_context` (L69)
- ⚡ `async_fn` `with_admin_context` (L103)

### `f/internal/_state_machine.py`
- 🔧 `fn` `validate_transition` (L40)

### `f/internal/_wmill_adapter.py`
- 🔧 `fn` `is_dict_str_any` (L8)
- 🔧 `fn` `get_variable_safe` (L11)
- 🔧 `fn` `get_resource_safe` (L18)
- 🔧 `fn` `log` (L30)

### `f/internal/ai_agent/_ai_agent_logic.py`
- 🔧 `fn` `adjust_intent_with_context` (L20)
- 🔧 `fn` `extract_entities` (L69)
- 🔧 `fn` `detect_context` (L139)
- 🔧 `fn` `determine_escalation_level` (L167)
- 🔧 `fn` `generate_ai_response` (L182)
- 🔧 `fn` `detect_social` (L197)

### `f/internal/ai_agent/_ai_agent_models.py`
- 📦 `class` `ConversationState` (L11)
- 📦 `class` `UserProfile` (L24)
- 📦 `class` `AIAgentInput` (L30)
- 📦 `class` `EntityMap` (L40)
- 📦 `class` `AvailabilityContext` (L54)
- 📦 `class` `ContextAdjustment` (L65)
- 📦 `class` `IntentResult` (L80)
- 📦 `class` `LLMOutputEntities` (L100)
- 📦 `class` `LLMOutput` (L107)

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
- 📦 `class` `ChatMessage` (L16)
- 📦 `class` `LLMResponse` (L20)
- ⚡ `async_fn` `call_llm` (L28)

### `f/internal/ai_agent/_prompt_builder.py`
- 🔧 `fn` `build_system_prompt` (L73)
- 🔧 `fn` `build_user_message` (L88)

### `f/internal/ai_agent/_rag_context.py`
- 📦 `class` `RAGResult` (L6)
- ⚡ `async_fn` `build_rag_context` (L11)
- ⚡ `async_fn` `get_rag_context` (L56)

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
- 🔧 `fn` `parse_action` (L21)
- 🔧 `fn` `parse_callback_data` (L42)
- 🔧 `fn` `apply_transition` (L56)
- 🔧 `fn` `flow_step_from_state` (L277)

### `f/internal/booking_fsm/_fsm_models.py`
- 📦 `class` `NamedItem` (L22)
- 📦 `class` `TimeSlotItem` (L26)
- 📦 `class` `DraftCore` (L37)
- 📦 `class` `DraftBooking` (L48)
- 🔧 `fn` `empty_draft` (L55)
- 📦 `class` `IdleState` (L62)
- 📦 `class` `SelectingSpecialtyState` (L65)
- 📦 `class` `SelectingDoctorState` (L70)
- 📦 `class` `SelectingTimeState` (L77)
- 📦 `class` `ConfirmingState` (L86)
- 📦 `class` `CompletedState` (L94)
- 📦 `class` `BookingStateRoot` (L111)
- 📦 `class` `SelectAction` (L118)
- 📦 `class` `SelectDateAction` (L122)
- 📦 `class` `BackAction` (L126)
- 📦 `class` `CancelAction` (L129)
- 📦 `class` `ConfirmYesAction` (L132)
- 📦 `class` `ConfirmNoAction` (L135)
- 📦 `class` `TransitionOutcome` (L154)

### `f/internal/booking_fsm/_fsm_responses.py`
- 📦 `class` `InlineButton` (L10)
- 🔧 `fn` `build_header` (L14)
- 🔧 `fn` `build_specialty_prompt` (L17)
- 🔧 `fn` `build_doctors_prompt` (L21)
- 🔧 `fn` `build_slots_prompt` (L25)
- 🔧 `fn` `build_confirmation_prompt` (L29)
- 🔧 `fn` `build_loading_doctors_prompt` (L33)
- 🔧 `fn` `build_loading_slots_prompt` (L36)
- 🔧 `fn` `chunk_buttons` (L43)
- 🔧 `fn` `build_specialty_keyboard` (L46)
- 🔧 `fn` `build_doctor_keyboard` (L51)
- 🔧 `fn` `build_time_slot_keyboard` (L57)
- 🔧 `fn` `build_confirmation_keyboard` (L63)

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

### `f/nlu/_tfidf_classifier.py`
- 📦 `class` `ModelData` (L170)
- 📦 `class` `ScoreEntry` (L196)
- 📦 `class` `TfIdfResult` (L200)
- 🔧 `fn` `classify_intent` (L205)

### `f/nlu/main.py`
- 📦 `class` `ExtractedIntent` (L19)
- ⚡ `async_fn` `main` (L53)

### `f/noshow_trigger/_noshow_logic.py`
- 📦 `class` `BookingRepository` (L5)
- ⚡ `async_fn` `find_expired_confirmed` (L9)
- ⚡ `async_fn` `mark_as_no_show` (L25)

### `f/noshow_trigger/_noshow_models.py`
- 📦 `class` `NoShowStats` (L4)
- 📦 `class` `InputSchema` (L10)
- 📦 `class` `ProviderRow` (L16)

### `f/noshow_trigger/main.py`
- ⚡ `async_fn` `provider_batch` (L41)
- ⚡ `async_fn` `main` (L91)

### `f/openrouter_benchmark/_benchmark_logic.py`
- 🔧 `fn` `extract_json` (L43)
- ⚡ `async_fn` `run_benchmark_task` (L73)

### `f/openrouter_benchmark/_benchmark_models.py`
- 📦 `class` `ModelCandidate` (L5)
- 📦 `class` `NLUIntent` (L9)
- 📦 `class` `ModelTestResult` (L14)
- 📦 `class` `ModelSummary` (L25)
- 📦 `class` `BenchmarkReport` (L34)
- 📦 `class` `TaskPrompt` (L39)
- 📦 `class` `OpenRouterUsage` (L45)
- 📦 `class` `OpenRouterChoiceMessage` (L50)
- 📦 `class` `OpenRouterChoice` (L54)
- 📦 `class` `OpenRouterResponse` (L58)

### `f/openrouter_benchmark/main.py`
- 🔧 `fn` `main` (L66)

### `f/patient_register/_patient_logic.py`
- ⚡ `async_fn` `upsert_client` (L6)

### `f/patient_register/_patient_models.py`
- 📦 `class` `ClientResult` (L5)
- 📦 `class` `InputSchema` (L14)

### `f/patient_register/main.py`
- ⚡ `async_fn` `operation` (L42)
- ⚡ `async_fn` `main` (L54)

### `f/provider_agenda/_agenda_logic.py`
- ⚡ `async_fn` `get_provider_agenda` (L7)

### `f/provider_agenda/_agenda_models.py`
- 📦 `class` `AgendaRow` (L6)
- 📦 `class` `AgendaInput` (L15)
- 📦 `class` `AgendaBooking` (L20)
- 📦 `class` `AgendaDay` (L28)
- 📦 `class` `AgendaResult` (L35)
- 📦 `class` `InputSchema` (L42)

### `f/provider_agenda/main.py`
- ⚡ `async_fn` `operation` (L34)
- ⚡ `async_fn` `main` (L55)

### `f/provider_manage/_manage_logic.py`
- ⚡ `async_fn` `handle_provider_actions` (L6)
- ⚡ `async_fn` `handle_service_actions` (L50)
- ⚡ `async_fn` `handle_schedule_actions` (L104)
- ⚡ `async_fn` `handle_override_actions` (L133)

### `f/provider_manage/_manage_models.py`
- 📦 `class` `InputSchema` (L6)

### `f/provider_manage/main.py`
- ⚡ `async_fn` `operation` (L41)
- ⚡ `async_fn` `main` (L65)

### `f/rag_query/_rag_logic.py`
- 📦 `class` `KBRepository` (L6)
- ⚡ `async_fn` `fetch_active_entries` (L10)
- 📦 `class` `ScoredEntry` (L44)
- 🔧 `fn` `perform_keyword_search` (L48)

### `f/rag_query/_rag_models.py`
- 📦 `class` `KBEntry` (L4)
- 📦 `class` `RAGResult` (L11)
- 📦 `class` `KBRow` (L16)
- 📦 `class` `InputSchema` (L22)

### `f/rag_query/main.py`
- ⚡ `async_fn` `operation` (L34)
- ⚡ `async_fn` `main` (L63)

### `f/reminder_config/_config_logic.py`
- ⚡ `async_fn` `load_preferences` (L14)
- ⚡ `async_fn` `save_preferences` (L43)
- 🔧 `fn` `build_config_message` (L64)
- 🔧 `fn` `build_window_config` (L81)
- 🔧 `fn` `set_all` (L100)

### `f/reminder_config/_config_models.py`
- 📦 `class` `ReminderPrefs` (L5)
- 📦 `class` `ReminderConfigResult` (L11)
- 📦 `class` `InputSchema` (L16)

### `f/reminder_config/main.py`
- ⚡ `async_fn` `operation` (L37)
- ⚡ `async_fn` `main` (L100)

### `f/reminder_cron/_reminder_logic.py`
- 🔧 `fn` `format_date_es` (L6)
- 🔧 `fn` `format_time_es` (L13)
- 🔧 `fn` `get_client_preference` (L16)
- 🔧 `fn` `build_booking_details` (L25)
- 🔧 `fn` `build_inline_buttons` (L45)

### `f/reminder_cron/_reminder_models.py`
- 📦 `class` `ReminderPrefs` (L6)
- 📦 `class` `BookingRecord` (L14)
- 📦 `class` `CronResult` (L31)
- 📦 `class` `InputSchema` (L39)

### `f/reminder_cron/_reminder_repository.py`
- ⚡ `async_fn` `get_bookings_for_window` (L7)
- ⚡ `async_fn` `mark_reminder_sent` (L44)

### `f/reminder_cron/main.py`
- ⚡ `async_fn` `provider_batch` (L54)
- ⚡ `async_fn` `main` (L108)

### `f/telegram_auto_register/_auto_register_logic.py`
- ⚡ `async_fn` `register_telegram_user` (L7)

### `f/telegram_auto_register/_auto_register_models.py`
- 📦 `class` `RegisterResult` (L4)
- 📦 `class` `InputSchema` (L8)

### `f/telegram_auto_register/main.py`
- ⚡ `async_fn` `operation` (L34)
- ⚡ `async_fn` `main` (L46)

### `f/telegram_callback/_callback_logic.py`
- 🔧 `fn` `parse_callback_data` (L17)
- ⚡ `async_fn` `confirm_booking` (L30)
- ⚡ `async_fn` `update_booking_status` (L61)
- ⚡ `async_fn` `answer_callback_query` (L107)
- ⚡ `async_fn` `send_followup_message` (L122)

### `f/telegram_callback/_callback_models.py`
- 📦 `class` `InputSchema` (L5)
- 📦 `class` `ActionContext` (L15)
- 📦 `class` `ActionResult` (L23)
- 📦 `class` `ActionHandler` (L27)
- ⚡ `async_fn` `handle` (L28)

### `f/telegram_callback/_callback_router.py`
- 📦 `class` `ConfirmHandler` (L8)
- ⚡ `async_fn` `handle` (L9)
- ⚡ `async_fn` `operation` (L12)
- 📦 `class` `CancelHandler` (L35)
- ⚡ `async_fn` `handle` (L36)
- ⚡ `async_fn` `operation` (L39)
- 📦 `class` `AcknowledgeHandler` (L62)
- ⚡ `async_fn` `handle` (L63)
- 📦 `class` `TelegramRouter` (L69)
- 🔧 `fn` `register` (L73)
- ⚡ `async_fn` `route` (L76)

### `f/telegram_callback/main.py`
- ⚡ `async_fn` `main` (L85)

### `f/telegram_gateway/_gateway_logic.py`
- 📦 `class` `TelegramClient` (L8)
- ⚡ `async_fn` `send_message` (L13)
- 📦 `class` `ClientRepository` (L40)
- ⚡ `async_fn` `ensure_registered` (L44)

### `f/telegram_gateway/_gateway_models.py`
- 📦 `class` `TelegramUser` (L9)
- 📦 `class` `TelegramChat` (L17)
- 📦 `class` `TelegramMessage` (L22)
- 📦 `class` `TelegramCallback` (L30)
- 📦 `class` `TelegramUpdate` (L37)
- 📦 `class` `SendMessageOptions` (L43)

### `f/telegram_gateway/main.py`
- 📦 `class` `TelegramRouter` (L15)
- ⚡ `async_fn` `route_update` (L20)
- ⚡ `async_fn` `handle_callback` (L27)
- ⚡ `async_fn` `handle_message` (L39)
- ⚡ `async_fn` `main` (L92)

### `f/telegram_menu/_menu_logic.py`
- 🔧 `fn` `parse_user_option` (L10)
- 📦 `class` `MenuController` (L16)
- ⚡ `async_fn` `handle` (L17)

### `f/telegram_menu/_menu_models.py`
- 📦 `class` `InlineButton` (L5)
- 📦 `class` `MenuInput` (L10)
- 📦 `class` `MenuResponse` (L16)
- 📦 `class` `InputSchema` (L22)
- 📦 `class` `MenuResult` (L23)

### `f/telegram_menu/main.py`
- ⚡ `async_fn` `main` (L39)

### `f/telegram_send/_telegram_logic.py`
- 📦 `class` `TelegramService` (L13)
- ⚡ `async_fn` `execute` (L18)
- 🔧 `fn` `prepare_request` (L43)
- ⚡ `async_fn` `api_call` (L84)
- 🔧 `fn` `normalize_keyboard` (L102)

### `f/telegram_send/_telegram_models.py`
- 📦 `class` `InlineButton` (L9)
- 📦 `class` `BaseTelegramInput` (L14)
- 📦 `class` `SendMessageInput` (L19)
- 📦 `class` `EditMessageInput` (L25)
- 📦 `class` `DeleteMessageInput` (L31)
- 📦 `class` `AnswerCallbackInput` (L41)
- 📦 `class` `TelegramInputRoot` (L63)
- 📦 `class` `TelegramResponseResult` (L66)
- 📦 `class` `TelegramResponse` (L69)
- 📦 `class` `TelegramSendData` (L76)

### `f/telegram_send/main.py`
- ⚡ `async_fn` `main` (L40)

### `f/web_admin_dashboard/_dashboard_logic.py`
- ⚡ `async_fn` `fetch_dashboard_stats` (L6)

### `f/web_admin_dashboard/_dashboard_models.py`
- 📦 `class` `AdminDashboardResult` (L4)
- 📦 `class` `InputSchema` (L12)

### `f/web_admin_dashboard/main.py`
- ⚡ `async_fn` `operation` (L34)
- ⚡ `async_fn` `main` (L46)

### `f/web_admin_provider_crud/_provider_logic.py`
- 🔧 `fn` `map_row_to_provider` (L6)
- ⚡ `async_fn` `list_providers` (L37)
- ⚡ `async_fn` `create_provider` (L61)
- ⚡ `async_fn` `update_provider` (L91)
- ⚡ `async_fn` `reset_provider_password` (L135)

### `f/web_admin_provider_crud/_provider_models.py`
- 📦 `class` `ProviderRow` (L5)
- 📦 `class` `CreateProviderResult` (L33)
- 📦 `class` `InputSchema` (L36)

### `f/web_admin_provider_crud/main.py`
- ⚡ `async_fn` `create_op` (L42)
- ⚡ `async_fn` `operation` (L51)
- ⚡ `async_fn` `main` (L78)

### `f/web_admin_regions/_regions_logic.py`
- ⚡ `async_fn` `list_regions` (L6)
- ⚡ `async_fn` `list_communes` (L25)
- ⚡ `async_fn` `search_communes` (L60)

### `f/web_admin_regions/_regions_models.py`
- 📦 `class` `RegionRow` (L5)
- 📦 `class` `CommuneRow` (L12)
- 📦 `class` `InputSchema` (L19)

### `f/web_admin_regions/main.py`
- 🔧 `fn` `main` (L50)

### `f/web_admin_specialties_crud/_specialty_logic.py`
- 🔧 `fn` `map_row` (L8)
- ⚡ `async_fn` `list_specialties` (L19)
- ⚡ `async_fn` `create_specialty` (L26)
- ⚡ `async_fn` `update_specialty` (L43)
- ⚡ `async_fn` `delete_specialty` (L67)
- ⚡ `async_fn` `set_status` (L74)

### `f/web_admin_specialties_crud/_specialty_models.py`
- 📦 `class` `SpecialtyRow` (L5)
- 📦 `class` `InputSchema` (L14)

### `f/web_admin_specialties_crud/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L58)

### `f/web_admin_tags/_tags_logic.py`
- 🔧 `fn` `map_category` (L8)
- 🔧 `fn` `map_tag` (L19)
- ⚡ `async_fn` `verify_admin_access` (L32)
- 📦 `class` `TagRepository` (L38)
- ⚡ `async_fn` `list_categories` (L42)
- ⚡ `async_fn` `create_category` (L58)
- ⚡ `async_fn` `update_category` (L69)
- ⚡ `async_fn` `set_category_status` (L89)
- ⚡ `async_fn` `delete_category` (L100)
- ⚡ `async_fn` `list_tags` (L107)
- ⚡ `async_fn` `create_tag` (L131)
- ⚡ `async_fn` `update_tag` (L146)
- ⚡ `async_fn` `set_tag_status` (L171)
- ⚡ `async_fn` `delete_tag` (L182)

### `f/web_admin_tags/_tags_models.py`
- 📦 `class` `CategoryRow` (L5)
- 📦 `class` `TagRow` (L14)
- 📦 `class` `InputSchema` (L25)

### `f/web_admin_tags/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L86)

### `f/web_admin_users/_user_logic.py`
- 🔧 `fn` `map_row` (L8)
- ⚡ `async_fn` `handle_user_actions` (L22)

### `f/web_admin_users/_user_models.py`
- 📦 `class` `UserInfo` (L5)
- 📦 `class` `UsersListResult` (L17)
- 📦 `class` `InputSchema` (L21)

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
- 🔧 `fn` `derive_idempotency_key` (L8)
- 🔧 `fn` `calculate_end_time` (L12)
- 📦 `class` `BookingRepository` (L22)
- ⚡ `async_fn` `resolve_tenant_for_booking` (L26)
- ⚡ `async_fn` `resolve_client_id` (L31)
- ⚡ `async_fn` `lock_provider` (L45)
- ⚡ `async_fn` `get_service_duration` (L50)
- ⚡ `async_fn` `check_overlap` (L55)
- ⚡ `async_fn` `insert_booking` (L73)
- ⚡ `async_fn` `get_booking` (L94)
- ⚡ `async_fn` `update_status` (L99)

### `f/web_booking_api/_booking_models.py`
- 📦 `class` `BookingResult` (L5)
- 📦 `class` `InputSchema` (L10)

### `f/web_booking_api/main.py`
- ⚡ `async_fn` `operation` (L46)
- 🔧 `fn` `main` (L129)

### `f/web_patient_bookings/_bookings_logic.py`
- ⚡ `async_fn` `resolve_client_id` (L10)
- ⚡ `async_fn` `get_patient_bookings` (L28)

### `f/web_patient_bookings/_bookings_models.py`
- 📦 `class` `BookingInfo` (L5)
- 📦 `class` `BookingsResult` (L17)
- 📦 `class` `InputSchema` (L22)

### `f/web_patient_bookings/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L47)

### `f/web_patient_profile/_profile_logic.py`
- 🔧 `fn` `map_to_profile` (L8)
- ⚡ `async_fn` `find_user` (L19)
- ⚡ `async_fn` `find_or_create_client` (L27)
- ⚡ `async_fn` `update_profile` (L48)

### `f/web_patient_profile/_profile_models.py`
- 📦 `class` `ProfileResult` (L5)
- 📦 `class` `InputSchema` (L14)

### `f/web_patient_profile/main.py`
- ⚡ `async_fn` `operation` (L33)
- 🔧 `fn` `main` (L59)

### `f/web_provider_dashboard/_provider_dashboard_logic.py`
- ⚡ `async_fn` `fetch_provider_dashboard` (L7)

### `f/web_provider_dashboard/_provider_dashboard_models.py`
- 📦 `class` `AgendaItem` (L5)
- 📦 `class` `ProviderStats` (L14)
- 📦 `class` `DashboardResult` (L21)
- 📦 `class` `InputSchema` (L28)

### `f/web_provider_dashboard/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L44)

### `f/web_provider_notes/_notes_logic.py`
- 🔧 `fn` `decrypt_content` (L9)
- 🔧 `fn` `map_row_to_note` (L18)
- 📦 `class` `NoteRepository` (L33)
- ⚡ `async_fn` `get_tags` (L37)
- ⚡ `async_fn` `assign_tags` (L50)
- ⚡ `async_fn` `create` (L59)
- ⚡ `async_fn` `read` (L81)
- ⚡ `async_fn` `list_notes` (L90)
- ⚡ `async_fn` `delete` (L124)

### `f/web_provider_notes/_notes_models.py`
- 📦 `class` `Tag` (L5)
- 📦 `class` `NoteRow` (L10)
- 📦 `class` `InputSchema` (L22)

### `f/web_provider_notes/main.py`
- ⚡ `async_fn` `operation` (L32)
- 🔧 `fn` `main` (L69)

### `f/web_provider_profile/_profile_logic.py`
- 📦 `class` `ProfileRepository` (L8)
- ⚡ `async_fn` `find_by_id` (L12)
- ⚡ `async_fn` `update` (L63)
- ⚡ `async_fn` `get_password_hash` (L89)
- ⚡ `async_fn` `update_password` (L96)

### `f/web_provider_profile/_profile_models.py`
- 📦 `class` `ProfileRow` (L5)
- 📦 `class` `InputSchema` (L26)

### `f/web_provider_profile/main.py`
- ⚡ `async_fn` `operation` (L33)
- 🔧 `fn` `main` (L79)

### `f/web_waitlist/_waitlist_logic.py`
- ⚡ `async_fn` `resolve_client_id` (L8)
- ⚡ `async_fn` `handle_join` (L27)
- ⚡ `async_fn` `handle_leave` (L70)
- ⚡ `async_fn` `handle_list` (L87)
- ⚡ `async_fn` `handle_check_position` (L111)

### `f/web_waitlist/_waitlist_models.py`
- 📦 `class` `WaitlistEntry` (L5)
- 📦 `class` `WaitlistResult` (L14)
- 📦 `class` `InputSchema` (L19)

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
