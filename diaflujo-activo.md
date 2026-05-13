# Diagrama 1 — Subgrafo Activo: Flujo Telegram Booking

> **Leyenda de colores**
> - 🟩 **Verde** — Bloque funcional activo en producción, probado
> - ⬜ **Gris** — Infraestructura base (DB, Redis, externos)
> - 🟦 **Azul claro** — Salidas / Notificaciones
> - 🟥 **Rojo** — Refactorización Dispatcher Pattern (implementada)
> - 🔴 **Rojo brillante** — Últimos cambios: nextDraft fix + NLU unification
> - ⚠️ **Rosa punteado** — Dead code (preprocesador no se consume)

Flujo principal que opera hoy en producción, representado como bloques funcionales agrupados por capa.

```mermaid
flowchart TB
    subgraph EXT["Entrada Externa"]
        TG["📱 Telegram Bot API"]
    end

    subgraph GATEWAY["Capa Gateway"]
        GW["Canal Telegram\n(gateway + auto-register + send)"]
    end

    subgraph PREPRO["⚠️ Pre-procesamiento (DEAD CODE)"]
        MPP["Message Preprocessor\n(text_cleaner + modism_mapper + spell_normalizer)"]
        NRM["Normalización\n(normalize + classify)"]
        DED["Deduplicación\n(deduplicate + skip_patterns)"]
    end

    subgraph DISPATCHER["🔴 Dispatcher O(1) — Router Refactorizado"]
        DISP["Dispatch Table\n(dict estado → handler)"]
        MH["MenuHandler\n(menú, info, mis datos, mis citas)"]
        RH["RegistrationHandler\n(FSM registro 5 estados)"]
        RMH["ReminderHandler\n(FSM recordatorios)"]
        BH["BookingHandler\n(FSM booking + NLU lazy fallback)"]
        NLU["🔴 NLU Lazy Unificado\n(solo si FSM no resuelve)"]
    end

    subgraph ORCH["Orquestación de Booking"]
        ORC["Orquestador Inteligente\n(orchestrator + context_resolver + intent_router)"]
        HCR["Handler Crear"]
        HCA["Handler Cancelar"]
        HRE["Handler Reagendar"]
        HAV["Handler Disponibilidad"]
    end

    subgraph CORE["Core Booking"]
        CR["Crear Cita\n(booking_create)"]
        CA["Cancelar Cita\n(booking_cancel)"]
        RE["Reagendar Cita\n(booking_reschedule)"]
        SE["Motor de Scheduling\n(scheduling_engine + availability)"]
    end

    subgraph PERSIST["Persistencia"]
        DB[("PostgreSQL\nbookings / clients / providers / audit")]
        RD[("Redis\nestado conversación / dedup / prefs")]
    end

    subgraph CBK["Callback Handler"]
        CBR["Callback Router\n(confirmar / cancelar / reagendar)"]
    end

    subgraph OUT["Salidas"]
        TGS["Notificaciones Telegram\n(telegram_send)"]
        GS["Sync Google Calendar\n(gcal_sync)"]
    end

    %% Flujo principal de mensajes de texto
    TG -->|webhook| GW
    GW -->|mensaje texto| MPP
    MPP -.->|⚠️ cleaned_text NO se usa| NRM
    GW -->|raw text directo| DED
    DED -->|user_input + state| DISP

    %% Dispatch O(1) por estado
    DISP -->|state=idle| MH
    DISP -->|state=registration| RH
    DISP -->|state=reminders_config| RMH
    DISP -->|state=booking FSM| BH

    %% MenuHandler → puede delegar a ReminderHandler
    MH -->|keyword=recordatorios| RMH

    %% BookingHandler → NLU solo si FSM no resuelve
    BH -->|action=None| NLU
    NLU -->|intent reconocido| BH
    NLU -->|intent=no match| TGS

    %% 🔴 nextDraft Fix: Estado + Draft se preservan
    BH -->|🔴 nextState + nextDraft| RD
    BH -->|FSM avanzó| ORC
    BH -->|respuesta directa| TGS

    %% Salidas de handlers
    MH -->|respuesta| TGS
    RH -->|respuesta| TGS
    RMH -->|respuesta| TGS

    %% Orquestador → Core
    ORC -->|crear| HCR
    ORC -->|cancelar| HCA
    ORC -->|reagendar| HRE
    ORC -->|disponibilidad| HAV

    HCR --> CR
    HCA --> CA
    HRE --> RE
    HAV --> SE

    CR --> DB
    CA --> DB
    RE --> DB
    SE --> DB

    CR -->|evento creado| GS
    CA -->|evento cancelado| GS
    RE -->|evento actualizado| GS

    %% Callback route (separada)
    GW -->|callback botón| CBR
    CBR -->|confirmar / cancelar| DB
    CBR --> TGS

    %% Persistencia
    GW -->|auto-register| DB
    MH -->|guardar estado| RD
    RH -->|guardar estado| RD
    RMH -->|guardar estado| RD
    BH -->|guardar estado + draft| RD

    classDef active fill:#90EE90,stroke:#006400,stroke-width:2px,color:#000
    classDef infra fill:#E0E0E0,stroke:#424242,stroke-width:1px,color:#000
    classDef out fill:#B3E5FC,stroke:#0277BD,stroke-width:1px,color:#000
    classDef critical fill:#FF6B6B,stroke:#8B0000,stroke-width:3px,color:#000
    classDef dead fill:#FFCCCB,stroke:#DC143C,stroke-width:2px,color:#000,stroke-dasharray: 5 5

    class GW,NRM,DED,ORC,HCR,HCA,HRE,HAV,CR,CA,RE,SE,CBR active
    class DB,RD infra
    class TGS,GS out
    class TG,EXT infra
    class DISP,MH,RH,RMH,BH,NLU critical
    class MPP dead
```

---

## Flujo de mensajes paso a paso

### Ruta 1: Mensaje de texto (usuario escribe)

```
Telegram → Gateway → ⚠️ Preprocessor (DEAD CODE — cleaned_text no se usa)
  → Deduplicate → Dispatch Table (O(1) lookup por estado en Redis)
    → state=idle          → MenuHandler (keywords: 1-5, "mis citas", "info")
    → state=registration  → RegistrationHandler (sí/no/nombre/teléfono/email)
    → state=reminders     → ReminderHandler (rem:ch:, rem:w:, rem:off)
    → state=booking FSM   → BookingHandler (FSM transition)
      → si FSM no resuelve → NLU Lazy Unificado (TF-IDF, ~20% de mensajes)
    → 🔴 nextState + nextDraft → Redis (draft preservado entre transiciones)
    → respuesta → Telegram Send
```

### Ruta 2: Callback de botón inline (usuario presiona botón)

```
Telegram → Gateway → Callback Router (directo, sin preprocessor ni dispatcher)
  → confirmar/cancelar/reagendar → DB + Google Calendar
  → respuesta → Telegram Send (edit message)
```

### 🔴 Últimos cambios implementados

| Cambio | Archivos | Impacto |
|--------|----------|---------|
| **nextDraft Fix** | `_booking_handler.py`, `_fsm_machine.py` | Draft se preserva entre transiciones FSM (specialty → doctor → time → confirm) |
| **NLU Unification** | `nlu/_tfidf_classifier.py`, `ai_agent/_tfidf_classifier.py` | Clasificadores unificados, entities extraídas, confidence floor fijo |
| **Lazy NLU Loading** | `_booking_handler.py` | NLU solo corre si FSM no resuelve (~80% ahorro CPU) |
| **⚠️ Preprocessor Dead Code** | `message_preprocessor/` | `cleaned_text` nunca se consume; webhook usa raw text directo |

### NLU Lazy — cuándo se ejecuta

| Escenario | ¿NLU corre? | Razón |
|-----------|------------|-------|
| Usuario escribe "1" | ❌ No | MenuHandler resuelve por keyword |
| Usuario escribe "sí" en registro | ❌ No | RegistrationHandler resuelve por estado |
| Usuario escribe "quiero una cita" sin teléfono | ✅ Sí | FSM no resuelve → NLU detecta `crear_cita` |
| Usuario escribe "hola" en idle | ✅ Sí | MenuHandler no match → NLU detecta `saludo` |
| Usuario escribe "xyzqwerty" | ✅ Sí | NLU → confidence=0 → "no entendí" |
| Usuario presiona botón inline | ❌ No | Callback Router, sin NLU |

### 🔴 nextDraft Fix — cómo funciona

```
FSM State (ConfirmingState)
  └── draft: DraftCore { specialty_id, doctor_id, start_time, ... }
        ↓
extract_draft_from_state(state)
  └── retorna DraftBooking con datos acumulados
        ↓
RouterResult { nextState: ..., nextDraft: {...} }
  └── Redis guarda draft para siguiente iteración
```

**Antes:** `nextDraft=None` → draft se perdía en cada transición  
**Después:** `nextDraft=extract_draft_from_state(nextState)` → draft se preserva

---

## Mapeo de bloques a archivos

| Bloque | Archivos |
|--------|----------|
| Canal Telegram | `telegram_gateway`, `telegram_send`, `telegram_auto_register` |
| ⚠️ Message Preprocessor | `message_preprocessor/main`, `_text_cleaner`, `_modism_mapper`, `_spell_normalizer` |
| Normalización | `telegram_normalize`, `telegram_classify` |
| Deduplicación | `telegram_deduplicate` (con `_SKIP_PATTERNS` regex) |
| **🔴 Dispatch Table** | `telegram_router/main` (22 líneas), `telegram_router/_dispatch_table` |
| **🔴 MenuHandler** | `telegram_router/handlers/_menu_handler` |
| **🔴 RegistrationHandler** | `telegram_router/handlers/_registration_handler` |
| **🔴 ReminderHandler** | `telegram_router/handlers/_reminder_handler` |
| **🔴 BookingHandler** | `telegram_router/handlers/_booking_handler` |
| **🔴 NLU Lazy Unificado** | `nlu/_tfidf_classifier` (llamado solo desde BookingHandler) |
| **🔴 extract_draft_from_state** | `booking_fsm/_fsm_machine.py` (nueva función) |
| Callback Router | `telegram_callback`, `_callback_logic`, `_callback_router` |
| Orquestador Inteligente | `booking_orchestrator`, `_context_resolver`, `_intent_router`, `handlers/_*` |
| Crear Cita | `booking_create`, `_create_booking_logic`, `_booking_create_repository` |
| Cancelar Cita | `booking_cancel`, `_cancel_booking_logic`, `_cancel_booking_repository` |
| Reagendar Cita | `booking_reschedule`, `_reschedule_logic`, `_reschedule_repository` |
| Motor de Scheduling | `scheduling_engine`, `availability_check` |
| Notificaciones Telegram | `telegram_send` |
| Sync Google Calendar | `gcal_sync` |
