# BOOKING TITANIUM — ROADMAP & CHECKLIST DE PRODUCCIÓN

**Fecha de creación:** 2026-04-02
**Versión actual:** 2.3.1
**Última actualización:** 2026-04-02 — P0 completado — P0 completado

---

## RESUMEN EJECUTIVO

| Métrica | Valor |
|---------|-------|
| Scripts TypeScript | 18 (5,295 líneas) |
| Tests passing | 182/182 ✅ |
| Tablas DB | 13 |
| Cobertura tests | ~19% scripts |
| Features vs Zocdoc | 35% |
| Features vs DocPlanner | 30% |
| Features vs Calendly HC | 40% |
| **Capa de IA** | **Superior a los 3** |

---

## P0 — CRÍTICO (Fix Immediately)

### Seguridad & Configuración
- [ ] Eliminar credenciales hardcodeadas de `.env.test`
- [ ] Agregar `.env.test` a `.gitignore`
- [ ] Crear `.env.example` con todas las variables requeridas
- [ ] Implementar GCal token refresh (OAuth2 flow)
- [ ] Eliminar dependencias unused (`googleapis`, `ioredis`, `neverthrow`)

### Código Crítico
- [ ] Implementar circuit breaker (tabla `circuit_breaker_state` existe, 0 scripts)
- [ ] Implementar distributed locks (tabla `booking_locks` existe, 0 scripts)
- [ ] Implementar dead letter queue processing (tabla `booking_dlq` existe, 0 scripts)
- [ ] Escribir en `conversations` table cada mensaje entrante/saliente
- [ ] Fix `sql.unsafe()` usage en `reminder_cron` (usar typed column access)
- [ ] Fix `require('postgres')` → `import` en 9 archivos

### Data Integrity
- [ ] Crear scripts de provider/service CRUD (al menos create + update)
- [ ] Crear script de patient registration
- [ ] Fix timezone bug en `booking_wizard` (doble conversión)
- [ ] Add audit trail insertion a `booking_wizard/createBookingInDB()`

---

## P1 — HIGH (Fix Before Production)

### Features Core Faltantes
- [ ] **GCal webhook receiver** — procesar push notifications entrantes de GCal
- [ ] **RAG query script** — consultar knowledge base con pgvector
- [ ] **Provider agenda view** — script para ver agenda diaria/semanal
- [ ] **Booking search/filter** — buscar por fecha, provider, status
- [ ] **No-show trigger** — script para marcar no-shows automáticamente
- [ ] **Health check endpoint** — `/health` para monitoreo

### Testing
- [ ] DB integration tests para booking_create, booking_cancel, booking_reschedule
- [ ] Tests para gcal_sync, gcal_reconcile
- [ ] Tests para telegram_send, gmail_send
- [ ] Tests para reminder_cron, reminder_config
- [ ] Tests para telegram_callback
- [ ] E2E tests: Telegram webhook → booking → notification

### Code Quality
- [ ] Extract shared `buildGCalEvent()` function (duplicado en gcal_sync y gcal_reconcile)
- [ ] Replace `Record<string, unknown>` con typed interfaces para DB query results
- [ ] Add rate limiting to telegram_send (Telegram API: 30 msg/s limit)

---

## P2 — MEDIUM (Improve Quality)

### Patient-Facing Features
- [ ] Patient Registration/Onboarding flow
- [ ] Patient Profile Management (edit profile, insurance info)
- [ ] Provider Search/Discovery (by specialty, location, rating)
- [ ] Provider Ratings & Reviews system
- [ ] Insurance Verification integration
- [ ] Payment Processing (Stripe, etc.)
- [ ] Waitlist Management (join waitlist for full slots)
- [ ] Multi-language Support (i18n — currently Spanish only)
- [ ] Mobile App (currently Telegram bot only)

### Provider-Facing Features
- [ ] Provider Dashboard (daily agenda, stats)
- [ ] Provider Availability Management CRUD (provider_schedules, schedule_overrides)
- [ ] Patient Notes (clinical notes per visit)
- [ ] Provider Notifications (new booking alerts — automated trigger)
- [ ] Multi-Provider Support (booking_wizard is single-provider only)
- [ ] No-Show Management (mark no-show, policies)

### Admin/Operations
- [ ] Admin Dashboard
- [ ] Analytics/Reporting (booking analytics, revenue, utilization)
- [ ] Bulk Operations (bulk cancel, bulk reschedule)
- [ ] Audit Log Viewer (audit trail exists but no viewer)
- [ ] Data Export (CSV/Excel)
- [ ] Backup/Restore scripts

### HIPAA Compliance
- [ ] Application-level encryption for patient PII (email, phone, name)
- [ ] Patient data deletion script (right to erasure)
- [ ] Access audit trail for read operations (SELECT queries)
- [ ] Remove PHI from GCal event descriptions
- [ ] Documented BAA coverage for all third-party services
- [ ] Session management (timeout, token rotation)
- [ ] Breach detection and notification system

---

## P3 — LOW (Nice to Have / Future)

### Infrastructure
- [ ] Create `Dockerfile.ai-agent` for production deployment
- [ ] CI/CD Pipeline (GitHub Actions)
- [ ] Enable HTTPS in nginx.conf
- [ ] Prometheus Metrics collection
- [ ] Grafana Dashboards provisioning

### Frontend (Week 7-10)
- [ ] Web interface (React + shadcn/ui) — patient panel
- [ ] Provider dashboard — schedule management, patients
- [ ] Multi-provider wizard with search
- [ ] Calendar view — visual availability
- [ ] Booking history UI with actions

### Advanced Features
- [ ] Telemedicine/Video Consult integration
- [ ] Prescription Management (Rx refill requests)
- [ ] Medical History/Records (intentionally out of HIPAA scope)

---

## COMPARACIÓN CON COMPETIDORES

| Feature | Zocdoc | DocPlanner | Calendly HC | **Booking Titanium** |
|---------|--------|------------|-------------|---------------------|
| Booking online | ✅ | ✅ | ✅ | ✅ |
| IA intent detection | Parcial | ❌ | ❌ | ✅ **Excelente** |
| Detección de urgencia | ❌ | ❌ | ❌ | ✅ **Único** |
| Context detection | ❌ | ❌ | ❌ | ✅ **Único** |
| GCal Sync | ✅ | ✅ | ✅ | ✅ |
| Reminders 3 ventanas | ✅ | ✅ | ✅ | ✅ |
| Transaction safety | ✅ | ✅ | ✅ | ✅ |
| Idempotencia | ✅ | ✅ | ✅ | ✅ |
| Audit trail | ✅ | ✅ | ✅ | ✅ |
| Multi-provider | ✅ | ✅ | ✅ | ❌ |
| Búsqueda proveedores | ✅ | ✅ | ❌ | ❌ |
| Ratings/Reviews | ✅ | ✅ | N/A | ❌ |
| Pagos | ✅ | ✅ | ✅ | ❌ |
| Dashboard proveedor | ✅ | ✅ | ✅ | ❌ |
| Telemedicina | ✅ | Parcial | ✅ | ❌ |
| Waitlist | ✅ | ✅ | ❌ | ❌ |
| App móvil | ✅ | ✅ | ✅ | ❌ |
| Analytics | ✅ | ✅ | ✅ | ❌ |

---

## PROGRESO GENERAL

| Fase | Items | Completados | Pendientes | % |
|------|-------|-------------|------------|---|
| P0 — Crítico | 16 | 0 | 16 | 0% |
| P1 — High | 17 | 0 | 17 | 0% |
| P2 — Medium | 22 | 0 | 22 | 0% |
| P3 — Low | 11 | 0 | 11 | 0% |
| **TOTAL** | **66** | **0** | **66** | **0%** |

---

## NOTAS

- **Fortaleza única:** Capa de IA superior a todos los competidores analizados
- **Debilidad crítica:** No es un producto completo — es un motor de booking enfocado en Telegram
- **Recomendación:** Enfocarse en P0-P1 antes de considerar producción
- **Frontend (P3):** Opcional dependiendo del scope (¿solo Telegram bot o plataforma completa?)
