# 📚 Documentación Maestra: Booking Titanium v5.0

Bienvenido a la base de conocimientos centralizada de **Booking Titanium**. Este sistema ha sido diseñado bajo los más altos estándares de ingeniería, combinando la robustez de **Go** y **PostgreSQL** con la agilidad de **TypeScript SSOT** y la potencia de **LLMs de última generación**.

---

## 🗺️ Guías Maestras (Source of Truth)

1.  **[AI Agent Handbook](./AI_AGENT_HANDBOOK.md):** Todo sobre la inteligencia del sistema. Estrategia de modelos (Groq/OpenAI), lógica de detección de intents, RAG y optimizaciones de prompts.
2.  **[Operations & Deployment Guide](./OPERATIONS_GUIDE.md):** La biblia operativa. Arquitectura de producción, procesos de despliegue (Canary), sincronización con Google Calendar y automatización de Git.
3.  **[TypeScript SSOT & Strict Typing Guide](./TYPESCRIPT_SSOT_GUIDE.md):** Estándares de desarrollo en TS. Reglas inviolables para eliminar `any`, `undefined` y `throw`, emulando la seguridad de Go.
4.  **[Project History & Lessons Learned](./PROJECT_HISTORY.md):** Registro evolutivo del proyecto. Hitos de las Fases 1, 2 y 3, métricas de éxito y sabiduría técnica acumulada.

---

## 🏗️ Resumen Arquitectónico

-   **Backend Core:** Go 1.25+ orquestado en **Windmill**.
-   **Base de Datos:** PostgreSQL 17 (Neon) con GiST EXCLUDE para concurrencia perfecta.
-   **Capa de IA:** Groq Llama 3.3 70B con **Semantic Caching** en Redis.
-   **Infraestructura:** Nginx + Cloudflare Tunnel + Docker Multi-stage.
-   **Integraciones:** Telegram Bot API (Webhook), GCal (Service Account), Gmail (SMTP).

---

## ⚡ Comandos Rápidos

-   **Deploy:** `wmill sync push --yes`
-   **Commit Seguro:** `./gp.sh "feat: descripción"`
-   **Tests:** `go test ./...` / `npm run check:all`

---

## 📂 Directorios Relevantes
-   `f/`: Scripts y flujos de Windmill.
-   `internal/`: Lógica de dominio, esquemas y utilidades core.
-   `migrations/`: Esquemas de base de datos evolucionados.
-   `docs/best-practices/`: Documentación técnica profunda por componente.

---
**Estado del Proyecto:** 🟢 Production Ready
**Última Revisión:** 31 de Marzo, 2026
