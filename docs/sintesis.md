# 📚 Síntesis Documental: Booking Titanium v5.0
**Estado:** 🟢 Production Ready (100% v4.0 Compliant)  
**Fecha de Síntesis:** 30 de Marzo, 2026  

Este documento unifica, filtra y estandariza toda la documentación dispersa del proyecto **Booking Titanium** bajo la arquitectura v5.0 (Single-Provider) usando Go y Windmill. Elimina redundancias y establece la única fuente de verdad técnica para el desarrollo y despliegue del sistema.

---

## 🏗️ 1. Arquitectura y Stack Tecnológico

El sistema ha migrado completamente de n8n a código Go orquestado en Windmill, utilizando infraestructura nativa de la nube.

*   **Lenguajes:** Go 1.25+ (Backend, Workers, Scripts Windmill), TypeScript/Bun (Scripts Windmill internos para parsing y AI).
*   **Bases de Datos:** PostgreSQL 17 (Neon) para estado primario, Redis 7 (Cache, Distributed Locks, Sessions).
*   **Infraestructura:** API Gateway Go HTTP (:8080), Nginx Reverse Proxy (Rate Limiting, Security Headers), Cloudflare Tunnel (`windmill.stax.ink`).
*   **Orquestación:** Windmill (17 Scripts, 2 Flows).
*   **APIs Externas:** Telegram Bot API (Webhook), Gmail SMTP (Puerto 587 + STARTTLS), Google Calendar API (Service Account).
*   **IA:** Groq Llama 3.3 70B (Primario), OpenAI GPT-4o-mini (Fallback).

---

## ⚖️ 2. Leyes Inviolables (v4.0 Definitive Edition)

El código debe cumplir estrictamente estas reglas. Cualquier violación impide el paso a producción.

1.  **Estructura de Scripts Go:** Todo script debe usar `package inner` y tener un entry point `func main(params...) (ReturnType, error)`. No se permiten panic silenciosos ni ignorar errores (`_`).
2.  **Zero Trust Input:** Validar todas las entradas (UUID v4, formato de fechas ISO 8601 en UTC, rangos de tiempo, campos no vacíos).
3.  **Transactional Safety (Saga Pattern):** La Base de Datos es la única fuente de verdad (Source of Truth). Las actualizaciones a GCal son secundarias. Si falla GCal, NO se hace rollback de la BD, se marca como `pending` para reconciliación (vía Cron). Si falla la BD, se elimina el evento creado en GCal.
4.  **Idempotencia Forzada:** Todas las operaciones de escritura deben generar y validar un `idempotency_key` usando SHA256 sobre los parámetros para evitar procesamiento duplicado (`booking_{service_id}_{time}_{chat_id}`).
5.  **HIPAA Compliance:** Nunca registrar Nombres, Emails o Teléfonos en texto plano dentro de los logs. Solo utilizar IDs (`patient_id`, `booking_id`).
6.  **Retry Protocol:** Fallos transitorios en servicios externos (5xx, timeouts, 429) deben reintentarse hasta 3 veces con backoff exponencial y jitter (ej. 1s, 3s, 9s). Errores permanentes (400, 401) fallan de inmediato.

---

## 🔐 3. Configuración y Environment Multiplexer

**PROHIBICIÓN ESTRICTA:** No se permiten archivos `.env` en la raíz del proyecto para evitar filtraciones de credenciales y facilitar la portabilidad a Windmill.

El patrón "Environment Multiplexer" detecta automáticamente el entorno (Desarrollo vs Producción) y cambia la fuente de lectura de los secretos sin modificar el código:

### Desarrollo Local (Máquina Dev)
Los secretos se leen desde variables de entorno locales (típicamente configuradas en `~/.bashrc` y archivos protegidos en `~/.secrets_wm/`).
*   `DEV_LOCAL_GCAL_KEY_PATH` -> Lee archivo JSON local.
*   `DEV_LOCAL_TELEGRAM_TOKEN` -> Lee el token directamente.
*   `DEV_LOCAL_GMAIL_USER` / `DEV_LOCAL_GMAIL_PASS` -> Credenciales de App Password.
*   `NEON_DATABASE_URL` -> Connection string de Neon (requiere `sslmode=require`).

### Producción (Windmill Workers)
Cuando las variables `DEV_LOCAL_*` no están presentes, el código usa `wmill.GetVariable()` o `wmill.GetResource()` apuntando a las variables secretas previamente creadas en la interfaz de Windmill:

*   `f/reservas/neon_dsn` (Resource DB)
*   `f/reservas/gmail_user` & `f/reservas/gmail_app_password` (Variables Secretas)
*   `f/reservas/gcal_sa_json` & `f/reservas/gcal_calendar_id` (Variables Secretas)
*   `f/reservas/telegram_bot_token` & `f/reservas/telegram_chat_id` (Variables Secretas)

> **Nota sobre Gmail:** En Go local con `net/smtp`, usar el puerto `587` con TLS explícito (`STARTTLS`). El puerto `465` (TLS implícito) requiere usar `tls.Dial` directamente.

---

## 👤 4. Arquitectura Single-Provider (v5.0)

El sistema pasó de múltiples proveedores a un único recurso administrado. 
*   **Tabla `system_config`:** Almacena la configuración maestra (IDs en formato UUID).
*   **Valores Estáticos (Config):** `single_provider_id`, `single_service_id`, `service_duration_min`, `service_buffer_min`.
*   **Optimización AI:** El prompt del modelo se redujo en un 36% al eliminar la extracción de entidades de Provider y Service. Solo extrae: fecha, hora, nombre e información de contacto.
*   **Flujos Simplificados:** Los flujos y orquestadores "inyectan" automáticamente los IDs de `system_config`. Ya no se requieren parámetros de Provider/Service en la capa de la API REST.

---

## ⚙️ 5. Patrones de Infraestructura Críticos

1.  **Circuit Breaker (PostgreSQL Persistido):** Previene sobrecarga de APIs externas. Estados: `CLOSED`, `OPEN` (bloqueo automático tras 5 fallos), `HALF-OPEN` (testeo tras timeout).
2.  **Distributed Lock (Redis/DB):** Evita la concurrencia en un mismo slot de tiempo. Modificado para incluir el `start_time` (ej. `lock_2026-03-29T10:00:00Z`). TTL default de 5 minutos, requiere `owner_token` para ser liberado.
3.  **Dead Letter Queue (DLQ):** Almacena operaciones y compensaciones (rollbacks) que fallaron repetidamente para ejecución manual (ej. no se pudo borrar un evento de GCal).
4.  **Concurrencia Estricta en BD:** El Booking Creation utiliza un Transaction Isolation Level `SERIALIZABLE` y consultas `SELECT ... FOR UPDATE` para evitar colisiones críticas identificadas en los *Paranoid Tests* (doble reserva en el mismo slot).

---

## 🚀 6. Guía de Despliegue (Deployment)

1.  **Migrar Base de Datos:**
    ```bash
    psql "$NEON_DATABASE_URL" -f database/migrations/003_single_provider_migration.sql
    psql "$NEON_DATABASE_URL" -f database/migrations/004_phase9_cleanup.sql
    ```
2.  **Sincronizar Windmill:** Desplegar recursos y scripts en `f/`.
    ```bash
    wmill sync push --yes
    ```
3.  **Levantar el API Gateway Localmente:**
    ```bash
    go build -o bin/api ./cmd/api
    ./bin/api &
    ```
4.  **Configurar Cron Jobs en Windmill:**
    *   `booking-reminders-cron`: `0 * * * *` (Alertas 24h/2h).
    *   `gcal-reconciliation-cron`: `*/5 * * * *` (Reintentos GCal Sync).
    *   `no-show-marking-cron`: `0 1 * * *` (Marca No-Shows).

---

## 🐛 7. Bugs Conocidos Resueltos y Testing

El sistema cuenta con pruebas exhaustivas (Unit, Integration, E2E y "Paranoid Red Team").
*   **Cobertura:** 100% pass en pruebas de lógica (Leaf scripts). Benchmarks rinden a >4 Millones de validaciones/segundo en generación de IDs.
*   **Problemas Críticos Corregidos:**
    *   *Nil Pointer Dereference en DB*: Solucionado añadiendo "retry logic" de inicialización en los tests (3 intentos) + `PingContext()`.
    *   *Falso Positivo en Adquisición de Locks*: Corregida la consulta `ON CONFLICT ... DO UPDATE` para leer y devolver el *owner* existente cuando el lock aún no ha expirado.
    *   *SQL Injection en Inputs*: Implementadas validaciones de expresiones regulares estrictas para el formateo de UUIDs y limitación de longitud máxima en Strings para rechazar cargas útiles maliciosas de entrada de texto.

---

## 📂 8. Desarrollo de Flows (Windmill)

*   **Rutas de Flows:** Deben estar formadas por un mínimo de 3 segmentos para evitar violación de restricciones (`f/flows/nombre_del_flow__flow/flow.yaml`).
*   **Tipos de Nodo YAML:** Usar obligatoriamente `type: script` para referencias. No usar la sintaxis antigua o no estandarizada `type: path`.
*   **Estructura Base Mínima:** Requiere `id` (snake_case), `summary`, `value.type`, `value.path` y `input_transforms`.
*   **Regla de Oro en Rollbacks (Orchestrator):** Las compensaciones de fallos (rollbacks) deben ejecutarse programáticamente en el orden **inverso** al de creación (LIFO). Si GCal se creó antes que DB, ante un error en DB, se elimina primero DB (si aplica) y luego el evento en GCal.
