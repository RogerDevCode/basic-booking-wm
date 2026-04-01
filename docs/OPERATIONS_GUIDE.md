# 🚀 Operations & Deployment Guide - Booking Titanium

Esta guía consolida la arquitectura de producción, los procesos de despliegue, la gestión de webhooks y las herramientas de automatización de Git.

---

## 1. Arquitectura de Producción (v2.3)

El sistema opera bajo un esquema de alta disponibilidad y resiliencia:

- **Reverse Proxy:** Nginx maneja el rate limiting (10 r/s) y seguridad de headers.
- **Tunneling:** Cloudflare Tunnel expone la API (`windmill.stax.ink`) sin abrir puertos.
- **Cache:** Redis gestiona el **Semantic Caching** y los **Distributed Locks**.
- **Resiliencia:** Implementación de **Circuit Breakers** (Sony/Gobreaker) para proteger las APIs de GCal, Telegram y Gmail.
- **Deduplicación:** Idempotencia forzada en bookings vía SHA256 de parámetros.

---

## 2. Proceso de Despliegue (Canary Rollout)

Se utiliza un script de despliegue automatizado (`scripts/deploy_production.sh`) con la siguiente estrategia:

1.  **Backup:** Creación de snapshot de la base de datos y configuración actual.
2.  **Canary (5%):** Despliegue de una instancia del AI Agent con monitoreo intensivo por 1 hora.
3.  **Full Rollout (100%):** Escalado a 3 instancias si los health checks y métricas de error (<5%) son satisfactorios.
4.  **Rollback:** Reversión automática ante fallos de health check o picos de latencia P95 > 10s.

---

## 3. Google Calendar Bidirectional Sync

### Sincronización DB → GCal
La base de datos es la **Única Fuente de Verdad**. Todo cambio en una reserva dispara una sincronización inmediata a GCal (Service Account). Fallos en GCal marcan la reserva como `pending_sync` para el cron job de reconciliación (cada 5 min).

### Webhooks GCal → DB
Permite detectar cancelaciones o ediciones hechas directamente por el usuario en su calendario.
- **Endpoint:** `POST /api/gcal/webhook`
- **Seguridad:** Validación de `X-Goog-Channel-Token`.
- **Renovación:** Los webhooks expiran cada 7 días; el script `f/gcal_webhook_renew` se ejecuta diariamente vía cron en Windmill.

---

## 4. Telegram Flow v2 (Integración AI)

Flujo de orquestación en Windmill:
1.  **Trigger:** Webhook de Telegram.
2.  **AI Agent:** Detección de intent y contexto.
3.  **Availability Check:** Consulta en Neon DB.
4.  **Smart Search:** Generación de respuesta contextual y sugerencias.
5.  **Telegram Enhanced:** Envío de mensaje con MarkdownV2 y botones inline (`f/telegram_send_enhanced`).

---

## 5. Herramienta Git: `gp.sh`

Script maestro para commits y pushes seguros:
- **Security Scan:** Bloquea el commit si detecta secretos (API keys de Groq, OpenAI, etc.).
- **Limpieza:** Elimina archivos `.env` accidentales.
- **Validación:** Verifica que el código compile (`go build`) antes de permitir el push.
- **Smart Push:** Solo actúa si hay cambios reales y usa `--force-with-lease` para seguridad.

---

## 📊 Métricas de Operación
- **Latencia P50:** < 500ms.
- **Cache Hit Rate:** Objetivo > 20%.
- **Disponibilidad:** 99.9%.
- **Error Rate:** < 1%.
