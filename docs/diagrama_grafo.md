# Grafo Funcional del Sistema de Reservas

## Técnica de Desarrollo: Walking Skeleton + Feature Slicing

**Principio**: cada nodo es una función de negocio independiente. Se construye primero el esqueleto completo con stubs (placeholders que devuelven datos hardcoded), y luego se reemplaza nodo por nodo con el módulo real ya probado.

**Estado de nodos:**
- 🟢 Verde (`:::done`) — implementado y con tests passing
- 🟡 Amarillo (`:::partial`) — implementado parcialmente o sin cobertura completa
- 🔴 Rojo (`:::stub`) — placeholder / pendiente de implementar

---

## Flujo Principal: Telegram → Reserva

```mermaid
flowchart TD
    %% ── Estilos ──────────────────────────────────────────────────────────
    classDef done    fill:#22c55e,color:#fff,stroke:#16a34a
    classDef partial fill:#eab308,color:#fff,stroke:#ca8a04
    classDef stub    fill:#ef4444,color:#fff,stroke:#dc2626
    classDef system  fill:#6366f1,color:#fff,stroke:#4f46e5
    classDef external fill:#94a3b8,color:#fff,stroke:#64748b

    %% ── Entradas externas ────────────────────────────────────────────────
    TG_MENU["📱 Telegram\nMenú inline"]:::external
    TG_CHAT["💬 Telegram\nChat libre"]:::external
    WEB_ADMIN["🌐 Web Admin"]:::external
    CRON["⏰ Crons /\nWebhooks internos"]:::external

    %% ── DOMINIO: INGESTA (Telegram gateway) ──────────────────────────────
    subgraph INGESTA["📥 Ingesta"]
        RECEIVE["Recibir webhook\nTelegram"]:::done
        DEDUP["Deduplicar\n(Redis SET NX)"]:::done
        PARSE["Parsear evento\n(mensaje / callback)"]:::done
    end

    %% ── DOMINIO: IDENTIDAD ───────────────────────────────────────────────
    subgraph IDENTIDAD["👤 Identidad"]
        AUTO_REG["Autoregistrar\nusuario Telegram"]:::done
        AUTH["Verificar\nautorización"]:::done
    end

    %% ── DOMINIO: COMPRENSIÓN (NLU) ───────────────────────────────────────
    subgraph NLU_DOM["🧠 Comprensión"]
        PREPROCESS["Preprocesar texto\n(spell / modismos)"]:::done
        CLASSIFY["Clasificar intención\n(TF-IDF → LLM fallback)"]:::done
        EXTRACT["Extraer entidades\n(fecha, hora, profesional)"]:::partial
    end

    %% ── DOMINIO: CONVERSACIÓN ────────────────────────────────────────────
    subgraph CONV["💾 Conversación"]
        CONV_GET["Leer estado\nconversación (Redis)"]:::done
        CONV_UPDATE["Actualizar estado\nconversación"]:::done
        ROUTER["Enrutar según\nintención + estado FSM"]:::done
    end

    %% ── DOMINIO: MENÚ ────────────────────────────────────────────────────
    subgraph MENU_DOM["📋 Menú"]
        MENU_BUILD["Construir menú\ninline dinámico"]:::done
        MENU_HANDLE["Procesar selección\nde botón"]:::done
    end

    %% ── DOMINIO: BOOKING ─────────────────────────────────────────────────
    subgraph BOOKING["📅 Reservas"]
        PREFETCH["Pre-cargar slots\ndisponibles"]:::done
        AVAIL["Verificar\ndisponibilidad"]:::done
        BOOK_CREATE["Crear reserva\n(FSM + constraint DB)"]:::done
        BOOK_CANCEL["Cancelar reserva"]:::done
        BOOK_RESCHEDULE["Reagendar reserva"]:::done
        BOOK_SEARCH["Buscar reserva\nactiva del cliente"]:::done
    end

    %% ── DOMINIO: NOTIFICACIONES ──────────────────────────────────────────
    subgraph NOTIF["🔔 Notificaciones"]
        SEND_TG["Enviar mensaje\nTelegram"]:::done
        SEND_EMAIL["Enviar email\n(Gmail)"]:::partial
        REMINDER["Enviar recordatorio\n(cron diario)"]:::partial
    end

    %% ── DOMINIO: SINCRONIZACIÓN ──────────────────────────────────────────
    subgraph SYNC["🔄 Sincronización"]
        GCAL_SYNC["Sync Google Calendar\n(outbox pattern)"]:::partial
        GCAL_REC["Reconciliación\nGCal ↔ DB"]:::stub
    end

    %% ── DOMINIO: ADMINISTRACIÓN ──────────────────────────────────────────
    subgraph ADMIN["⚙️ Administración"]
        PROV_MANAGE["Gestionar\nproveedores"]:::done
        SCHEDULE_SEED["Sembrar agenda\n(slots del proveedor)"]:::done
        PROVIDER_AGENDA["Ver agenda\ndel proveedor"]:::done
        AUTO_CANCEL["Auto-cancelar\ncitas expiradas"]:::done
        NOSHOW["Registrar\nno-show"]:::partial
    end

    %% ── DOMINIO: WEB ─────────────────────────────────────────────────────
    subgraph WEB["🌐 Web"]
        WEB_AUTH["Autenticación\nweb (JWT)"]:::done
        WEB_BOOK["API booking\nweb"]:::done
        WEB_DASH["Dashboard\nproveedor"]:::done
        WEB_ADMIN_PANEL["Panel\nadmin"]:::done
    end

    %% ── Flujo: Telegram ──────────────────────────────────────────────────
    TG_MENU --> RECEIVE
    TG_CHAT --> RECEIVE
    RECEIVE --> DEDUP
    DEDUP -- "duplicado → drop" --> RECEIVE
    DEDUP -- "nuevo" --> PARSE

    PARSE --> AUTO_REG
    AUTO_REG --> AUTH
    AUTH --> CONV_GET

    PARSE -- "texto libre" --> PREPROCESS
    PREPROCESS --> CLASSIFY
    CLASSIFY --> EXTRACT
    EXTRACT --> ROUTER

    PARSE -- "callback botón" --> MENU_HANDLE
    MENU_HANDLE --> ROUTER

    CONV_GET --> ROUTER
    ROUTER --> CONV_UPDATE

    ROUTER -- "mostrar menú" --> MENU_BUILD
    MENU_BUILD --> SEND_TG

    ROUTER -- "agendar" --> PREFETCH
    PREFETCH --> AVAIL
    AVAIL --> BOOK_CREATE
    BOOK_CREATE --> CONV_UPDATE
    BOOK_CREATE --> GCAL_SYNC
    BOOK_CREATE --> SEND_TG

    ROUTER -- "cancelar" --> BOOK_CANCEL
    BOOK_CANCEL --> SEND_TG

    ROUTER -- "reagendar" --> BOOK_RESCHEDULE
    BOOK_RESCHEDULE --> SEND_TG

    ROUTER -- "ver cita" --> BOOK_SEARCH
    BOOK_SEARCH --> SEND_TG

    %% ── Flujo: Web Admin ─────────────────────────────────────────────────
    WEB_ADMIN --> WEB_AUTH
    WEB_AUTH --> WEB_BOOK
    WEB_AUTH --> WEB_DASH
    WEB_AUTH --> WEB_ADMIN_PANEL
    WEB_ADMIN_PANEL --> PROV_MANAGE
    WEB_ADMIN_PANEL --> SCHEDULE_SEED

    %% ── Flujo: Crons internos ────────────────────────────────────────────
    CRON --> AUTO_CANCEL
    CRON --> REMINDER
    CRON --> GCAL_SYNC
    CRON --> GCAL_REC
    CRON --> NOSHOW

    REMINDER --> SEND_TG
    REMINDER --> SEND_EMAIL
    GCAL_SYNC --> GCAL_REC
    NOSHOW --> SEND_TG
```

---

## Mapa de Módulos → Nodos funcionales

| Nodo funcional | Módulo(s) Windmill | Estado |
|---|---|---|
| Recibir webhook | `f/telegram_gateway` | 🟢 |
| Deduplicar | `f/internal/telegram_deduplicate` | 🟢 |
| Parsear evento | `f/flows/telegram_webhook/intake.py` | 🟢 |
| Autoregistrar usuario | `f/telegram_auto_register` | 🟢 |
| Verificar autorización | `f/auth_provider` | 🟢 |
| Preprocesar texto | `f/message_preprocessor` | 🟢 |
| Clasificar intención | `f/internal/telegram_classify` + `f/nlu` | 🟢 |
| Extraer entidades | `f/internal/message_parser` | 🟡 |
| Leer estado conversación | `f/internal/conversation_get` | 🟢 |
| Actualizar estado | `f/internal/conversation_update` | 🟢 |
| Enrutar FSM | `f/internal/telegram_router` | 🟢 |
| Construir menú | `f/telegram_menu` | 🟢 |
| Procesar botón | `f/telegram_callback` | 🟢 |
| Pre-cargar slots | `f/internal/booking_prefetch` | 🟢 |
| Verificar disponibilidad | `f/availability_check` | 🟢 |
| Crear reserva | `f/internal/booking_confirm` + `f/services/booking/core` | 🟢 |
| Cancelar reserva | `f/booking_cancel` | 🟢 |
| Reagendar reserva | `f/booking_reschedule` | 🟢 |
| Buscar reserva | `f/booking_search` | 🟢 |
| Enviar Telegram | `f/telegram_send` | 🟢 |
| Enviar email | `f/gmail_send` | 🟡 |
| Recordatorio | `f/reminder_cron` + `f/reminder_config` | 🟡 |
| Sync GCal | `f/gcal_sync` | 🟡 |
| Reconciliación GCal | `f/gcal_reconcile` | 🔴 |
| Auto-cancelar expiradas | `f/auto_cancel_expired` | 🟢 |
| No-show | `f/noshow_trigger` | 🟡 |
| Gestionar proveedores | `f/provider_manage` | 🟢 |
| Agenda proveedor | `f/provider_agenda` | 🟢 |
| Sembrar agenda | `f/admin_schedule_seed` | 🟢 |
| Auth web | `f/web/auth_*` | 🟢 |
| API booking web | `f/web/booking_api` | 🟢 |
| Dashboard proveedor | `f/web/provider_dashboard` | 🟢 |
| Panel admin | `f/web/admin_*` | 🟢 |

---

## Protocolo Walking Skeleton para nuevos flujos

```
1. DEFINIR el nodo como stub en el grafo (🔴)
2. CREAR el script Windmill con main() que devuelve datos hardcoded
3. CONECTAR el nodo al flujo (flow.yaml o llamada directa)
4. VERIFICAR que el flujo end-to-end llega hasta Telegram (humo)
5. REEMPLAZAR el stub con el módulo real ya desarrollado
6. TESTEAR el módulo en aislamiento (pytest, sin red/DB)
7. DESPLEGAR y validar en staging con datos reales
8. MARCAR el nodo como 🟢
```

> **Regla**: nunca conectes un nodo sin que el flujo completo pueda ejecutarse de punta a punta, aunque sea con datos fake.
