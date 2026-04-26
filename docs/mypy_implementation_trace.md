# Mypy Strict Mode Implementation Trace

**Total Errors:** 1791
**Objective:** Achieve 0 errors under `mypy --strict` as per `LAW-02` in AGENTS.md.

## Execution Checklist
### Prioritize modules with the highest number of errors or core modules first.

<details open>
<summary><b>Module: <code>admin_honorifics</code> (0 errors) ✅</b></summary>

- [x] `f/admin_honorifics/main.py`: 0 errors
- [x] `f/admin_honorifics/_honorifics_logic.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>auth_provider</code> (0 errors) ✅</b></summary>

- [x] `f/auth_provider/main.py`: 0 errors
- [x] `f/auth_provider/_auth_logic.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>availability_check</code> (0 errors) ✅</b></summary>

- [x] `f/availability_check/main.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>booking_cancel</code> (0 errors) ✅</b></summary>

- [x] `f/booking_cancel/main.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>booking_create</code> (0 errors) ✅</b></summary>

- [x] `f/booking_create/_booking_create_models.py`: 0 errors
- [x] `f/booking_create/main.py`: 0 errors
- [x] `f/booking_create/_booking_create_repository.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>booking_orchestrator</code> (0 errors) ✅</b></summary>

- [x] `f/booking_orchestrator/handlers/_get_my_bookings.py`: 0 errors
- [x] `f/booking_orchestrator/main.py`: 0 errors
- [x] `f/booking_orchestrator/handlers/_list_available.py`: 0 errors
- [x] `f/booking_orchestrator/handlers/_create.py`: 0 errors
- [x] `f/booking_orchestrator/handlers/_reschedule.py`: 0 errors
- [x] `f/booking_orchestrator/handlers/_cancel.py`: 0 errors
- [x] `f/booking_orchestrator/_context_resolver.py`: 0 errors
- [x] `f/booking_orchestrator/_intent_router.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>booking_reschedule</code> (0 errors) ✅</b></summary>

- [x] `f/booking_reschedule/main.py`: 0 errors
- [x] `f/booking_reschedule/_reschedule_models.py`: 0 errors
- [x] `f/booking_reschedule/_reschedule_repository.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>booking_search</code> (0 errors) ✅</b></summary>

- [x] `f/booking_search/main.py`: 0 errors
- [x] `f/booking_search/_search_logic.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>booking_wizard</code> (0 errors) ✅</b></summary>

- [x] `f/booking_wizard/main.py`: 0 errors
- [x] `f/booking_wizard/_wizard_logic.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>circuit_breaker</code> (0 errors) ✅</b></summary>

- [x] `f/circuit_breaker/_circuit_logic.py`: 0 errors
- [x] `f/circuit_breaker/main.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>conversation_logger</code> (0 errors) ✅</b></summary>

- [x] `f/conversation_logger/main.py`: 0 errors
- [x] `f/conversation_logger/_logger_logic.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>distributed_lock</code> (0 errors) ✅</b></summary>

- [x] `f/distributed_lock/_lock_logic.py`: 0 errors
- [x] `f/distributed_lock/main.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>dlq_processor</code> (0 errors) ✅</b></summary>

- [x] `f/dlq_processor/_dlq_logic.py`: 0 errors
- [x] `f/dlq_processor/main.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>gcal_reconcile</code> (0 errors) ✅</b></summary>

- [x] `f/gcal_reconcile/_reconcile_logic.py`: 0 errors
- [x] `f/gcal_reconcile/main.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>gcal_sync</code> (0 errors) ✅</b></summary>

- [x] `f/gcal_sync/_sync_event_logic.py`: 0 errors
- [x] `f/gcal_sync/main.py`: 0 errors
- [x] `f/gcal_sync/_gcal_api_adapter.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>gmail_send</code> (0 errors) ✅</b></summary>

- [x] `f/gmail_send/_gmail_logic.py`: 0 errors
- [x] `f/gmail_send/main.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>health_check</code> (0 errors) ✅</b></summary>

- [x] `f/health_check/main.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>nlu</code> (0 errors) ✅</b></summary>

- [x] `f/nlu/_tfidf_classifier.py`: 0 errors
- [x] `f/nlu/main.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>noshow_trigger</code> (0 errors) ✅</b></summary>

- [x] `f/noshow_trigger/main.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>patient_register</code> (0 errors) ✅</b></summary>

- [x] `f/patient_register/main.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>provider_agenda</code> (0 errors) ✅</b></summary>

- [x] `f/provider_agenda/main.py`: 0 errors
- [x] `f/provider_agenda/_agenda_logic.py`: 0 errors
</details>

<details open>
<summary><b>Module: <code>provider_manage</code> (0 errors) ✅</b></summary>

- [x] `f/provider_manage/main.py`: 0 errors
- [x] `f/provider_manage/_manage_logic.py`: 0 errors
- [x] `f/provider_manage/_manage_models.py`: 0 errors
</details>

<details>
<summary><b>Module: <code>rag_query</code> (10 errors)</b></summary>

- [ ] `f/rag_query/main.py`: 6 errors
- [ ] `f/rag_query/_rag_logic.py`: 4 errors
</details>

<details>
<summary><b>Module: <code>reminder_config</code> (10 errors)</b></summary>

- [ ] `f/reminder_config/main.py`: 7 errors
- [ ] `f/reminder_config/_config_logic.py`: 3 errors
</details>

<details>
<summary><b>Module: <code>reminder_cron</code> (31 errors)</b></summary>

- [ ] `f/reminder_cron/main.py`: 20 errors
- [ ] `f/reminder_cron/_reminder_logic.py`: 9 errors
- [ ] `f/reminder_cron/_reminder_repository.py`: 2 errors
</details>

<details>
<summary><b>Module: <code>telegram_auto_register</code> (6 errors)</b></summary>

- [ ] `f/telegram_auto_register/main.py`: 6 errors
</details>

<details>
<summary><b>Module: <code>telegram_callback</code> (10 errors)</b></summary>

- [ ] `f/telegram_callback/main.py`: 8 errors
- [ ] `f/telegram_callback/_callback_logic.py`: 2 errors
</details>

<details>
<summary><b>Module: <code>telegram_gateway</code> (15 errors)</b></summary>

- [ ] `f/telegram_gateway/_gateway_logic.py`: 11 errors
- [ ] `f/telegram_gateway/main.py`: 4 errors
</details>

<details>
<summary><b>Module: <code>telegram_menu</code> (16 errors)</b></summary>

- [ ] `f/telegram_menu/main.py`: 13 errors
- [ ] `f/telegram_menu/_menu_logic.py`: 3 errors
</details>

<details>
<summary><b>Module: <code>telegram_send</code> (85 errors)</b></summary>

- [ ] `f/telegram_send/_telegram_logic.py`: 73 errors
- [ ] `f/telegram_send/main.py`: 12 errors
</details>

<details>
<summary><b>Module: <code>web_admin_dashboard</code> (29 errors)</b></summary>

- [ ] `f/web_admin_dashboard/_dashboard_logic.py`: 23 errors
- [ ] `f/web_admin_dashboard/main.py`: 6 errors
</details>

<details>
<summary><b>Module: <code>web_admin_provider_crud</code> (96 errors)</b></summary>

- [ ] `f/web_admin_provider_crud/_provider_logic.py`: 81 errors
- [ ] `f/web_admin_provider_crud/main.py`: 15 errors
</details>

<details>
<summary><b>Module: <code>web_admin_regions</code> (20 errors)</b></summary>

- [ ] `f/web_admin_regions/main.py`: 14 errors
- [ ] `f/web_admin_regions/_regions_logic.py`: 6 errors
</details>

<details>
<summary><b>Module: <code>web_admin_specialties_crud</code> (36 errors)</b></summary>

- [ ] `f/web_admin_specialties_crud/_specialty_logic.py`: 23 errors
- [ ] `f/web_admin_specialties_crud/main.py`: 13 errors
</details>

<details>
<summary><b>Module: <code>web_admin_tags</code> (64 errors)</b></summary>

- [ ] `f/web_admin_tags/_tags_logic.py`: 49 errors
- [ ] `f/web_admin_tags/main.py`: 15 errors
</details>

<details>
<summary><b>Module: <code>web_admin_users</code> (46 errors)</b></summary>

- [ ] `f/web_admin_users/_user_logic.py`: 35 errors
- [ ] `f/web_admin_users/main.py`: 11 errors
</details>

<details>
<summary><b>Module: <code>web_auth_change_role</code> (6 errors)</b></summary>

- [ ] `f/web_auth_change_role/main.py`: 6 errors
</details>

<details>
<summary><b>Module: <code>web_auth_complete_profile</code> (6 errors)</b></summary>

- [ ] `f/web_auth_complete_profile/main.py`: 6 errors
</details>

<details>
<summary><b>Module: <code>web_auth_login</code> (6 errors)</b></summary>

- [ ] `f/web_auth_login/main.py`: 6 errors
</details>

<details>
<summary><b>Module: <code>web_auth_me</code> (8 errors)</b></summary>

- [ ] `f/web_auth_me/main.py`: 6 errors
- [ ] `f/web_auth_me/_me_logic.py`: 2 errors
</details>

<details>
<summary><b>Module: <code>web_auth_register</code> (6 errors)</b></summary>

- [ ] `f/web_auth_register/main.py`: 6 errors
</details>

<details>
<summary><b>Module: <code>web_booking_api</code> (58 errors)</b></summary>

- [ ] `f/web_booking_api/main.py`: 50 errors
- [ ] `f/web_booking_api/_booking_logic.py`: 8 errors
</details>

<details>
<summary><b>Module: <code>web_patient_bookings</code> (17 errors)</b></summary>

- [ ] `f/web_patient_bookings/_bookings_logic.py`: 11 errors
- [ ] `f/web_patient_bookings/main.py`: 6 errors
</details>

<details>
<summary><b>Module: <code>web_patient_profile</code> (55 errors)</b></summary>

- [ ] `f/web_patient_profile/_profile_logic.py`: 32 errors
- [ ] `f/web_patient_profile/main.py`: 23 errors
</details>

<details>
<summary><b>Module: <code>web_provider_dashboard</code> (9 errors)</b></summary>

- [ ] `f/web_provider_dashboard/main.py`: 6 errors
- [ ] `f/web_provider_dashboard/_provider_dashboard_logic.py`: 3 errors
</details>

<details>
<summary><b>Module: <code>web_provider_notes</code> (32 errors)</b></summary>

- [ ] `f/web_provider_notes/_notes_logic.py`: 21 errors
- [ ] `f/web_provider_notes/main.py`: 11 errors
</details>

<details>
<summary><b>Module: <code>web_provider_profile</code> (19 errors)</b></summary>

- [ ] `f/web_provider_profile/main.py`: 11 errors
- [ ] `f/web_provider_profile/_profile_logic.py`: 8 errors
</details>

<details>
<summary><b>Module: <code>web_waitlist</code> (26 errors)</b></summary>

- [ ] `f/web_waitlist/_waitlist_logic.py`: 20 errors
- [ ] `f/web_waitlist/main.py`: 6 errors
</details>
