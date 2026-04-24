# GEMINI.md

## ✅ Status — Migración a Python Completada (2026-04-24)

**Resumen final:**
- **Sistema:** 100% Python 3.11+ (estándar §PY 2025-2026).
- **Purga:** Todos los archivos `.ts`, `package.json` y `node_modules` han sido eliminados.
- **Tests de Contrato:** Verificación de paridad funcional completada para 33+ módulos.
- **Windmill:** Metadatos regenerados para despliegue en entorno Python.

---

## 🗺️ Índice del Proyecto (Solo Python)

1. **FASE 1 — Core Booking:** `f/booking_create/`, `f/booking_cancel/`, `f/booking_reschedule/`, `f/booking_search/`.
2. **FASE 3 — Disponibilidad:** `f/availability_check/`, `f/internal/scheduling_engine/`.
3. **FASE 5 — Telegram:** `f/telegram_gateway/`, `f/telegram_callback/`, `f/telegram_send/`, `f/telegram_menu/`, `f/telegram_auto_register/`.
4. **FASE 6 — AI Agent:** `f/internal/ai_agent/`.
5. **FASE 7 — Web APIs:** `f/web_auth_*`, `f/web_admin_*`, `f/web_patient_*`, `f/web_provider_*`, `f/web_waitlist`.
6. **FASE 8 — Infraestructura:** `f/circuit_breaker/`, `f/distributed_lock/`, `f/dlq_processor/`, `f/reminder_cron/`, `f/conversation_logger/`, `f/health_check/`.
7. **FASE 0 — Soporte:** `f/internal/_result.py`, `f/internal/_db_client.py`, `f/internal/_crypto.py`, `f/internal/_config.py`.

---

## 🏗️ Arquitectura (§PY)

### Split-Monolith (Java-like)
Cada carpeta en `f/` contiene:
- `main.py` -> Entrypoint (validación Pydantic + orquestación).
- `_logic.py` -> Lógica de dominio pura (sin IO).
- `_models.py` -> Schemas y DTOs.
- `_repository.py` -> (Opcional) Capa de acceso a datos SQL.

### Reglas Inviolables
- **No Rais:** Prohibido lanzar excepciones para flujo de negocio; usar `Result[T, E]`.
- **Typing:** `mypy --strict` obligatorio en CI.
- **RLS:** Aislamiento forzado mediante `with_tenant_context`.

---

## 🗓️ Próximos Pasos
1. Despliegue masivo a Windmill Pro.
2. Monitoreo de latencia en el motor NLU (Python vs original Node).
3. Expansión de la suite de Web APIs para soporte móvil.
