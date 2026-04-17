# Monolith Split Trace

## CHECKPOINT TRACKER

| # | Feature dir | Archivos | Estado |
|---|-------------|----------|--------|
| 1-22 | f/internal/* | types, services, main | DONE |
| 23 | f/admin_honorifics | types, services, main | DONE |
| 24 | f/availability_check | types, services, main | DONE |
| 25 | f/booking_create | types, services, main | DONE |
| 26 | f/conversation_logger | types, services, main | DONE |
| 27 | f/web_auth_me | types, services, main | DONE |
| 28 | f/health_check | types, services, main | DONE |
| 29 | f/telegram_menu | types, services, main | DONE |
| 30 | f/gcal_webhook_renew | types, services, main | DONE |
| 31 | f/telegram_auto_register | types, services, main | DONE |
| 32 | f/web_admin_dashboard | types, services, main | DONE |
| 33 | f/web_admin_regions | types, services, main | DONE |
| 34 | f/gcal_webhook_setup | types, services, main | DONE |
| 35 | f/provider_agenda | types, main | DONE |
| 36 | f/booking_search | types, main | DONE |
| 37 | f/web_provider_dashboard | types, main | DONE |
| 38 | f/web_auth_change_role | types, main | DONE |
| 39 | f/patient_register | types, main | DONE |
| 40 | f/booking_orchestrator | types, getEntity.ts, normalizeIntent.ts, resolveContext.ts, handleCreateBooking.ts, handleCancelBooking.ts, handleReschedule.ts, handleListAvailable.ts, handleGetMyBookings.ts, main.ts | DONE |
| 41 | f/telegram_callback | types.ts, main.ts, answerCallbackQuery.ts, confirmBooking.ts, parseCallbackData.ts, sendFollowUpMessage.ts, updateBookingStatus.ts, updateReminderPreferences.ts | DONE |
| 42 | f/booking_wizard | types.ts, main.ts, WizardRepository.ts, WizardUI.ts, DateUtils.ts | DONE |
| 43 | f/openrouter_benchmark | types.ts, main.ts, services.ts | DONE |
| 44 | f/gemini_test | types.ts, main.ts, services.ts | DONE |
| 45 | f/reminder_cron | types.ts, main.ts, services.ts | DONE |
| 46 | f/telegram_gateway | types.ts, main.ts, services.ts | DONE |
| 47 | f/distributed_lock | types.ts, main.ts, acquireLock.ts, checkLock.ts, cleanupLocks.ts, executeLockAction.ts, mapRowToLockInfo.ts, releaseLock.ts, tryInsertLock.ts, tryStealExpiredLock.ts | DONE |
| 48 | f/gcal_sync | types.ts, main.ts, callGCalAPI.ts, fetchBookingDetails.ts, syncEvent.ts, updateBookingSyncStatus.ts | DONE |
| 49 | f/web_provider_notes | types.ts, main.ts, decryptContent.ts, encryptContent.ts, mapRowToNote.ts | DONE |
| 50 | f/provider_dashboard | types.ts, main.ts | DONE |
| 51 | f/booking_reschedule | types.ts, main.ts, authorize.ts, executeReschedule.ts, fetchBooking.ts, fetchService.ts | DONE |
| 52 | f/noshow_trigger | types.ts, main.ts | DONE |
| 53 | f/reminder_config | types.ts, main.ts, buildConfigMessage.ts, buildWindowConfig.ts, formatPrefs.ts, loadPreferences.ts, savePreferences.ts, setAll.ts, toggleValue.ts | DONE |
| 54 | f/circuit_breaker | types.ts, main.ts, getCircuitBreakerTx.ts, getState.ts, initService.ts | DONE |

## Pendientes (0 archivos)

## Estado Final
- TypeScript strict: PASS
- Progreso: 54/54 features (100%)
- Estado: COMPLETADO