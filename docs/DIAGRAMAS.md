# 📊 Diagramas de Flujos - Booking Titanium

Este documento contiene diagramas Mermaid que visualizan los flujos del sistema.

---

## 1. Telegram Webhook Flow (NN_01 Equivalente)

```mermaid
flowchart TD
    A[📩 Telegram Webhook] --> B[parse_message]
    B --> C{Valida?}
    C -->|❌ Error| D[gate_parser_error]
    C -->|✅ OK| E[ai_agent]
    
    E --> F{Detecta Intención}
    F -->|create_appointment| G[execute_action<br/>booking-orchestrator]
    F -->|cancel_appointment| G
    F -->|reschedule_appointment| G
    F -->|check_availability| H[availability-check]
    F -->|greeting/farewell| I[send_telegram_response]
    
    G --> J{Éxito?}
    J -->|✅ Sí| I
    J -->|❌ No| K[rollback]
    
    I --> L[✅ Mensaje enviado]
    K --> M[❌ Error al usuario]
    
    style A fill:#4CAF50,color:#fff
    style L fill:#4CAF50,color:#fff
    style M fill:#f44336,color:#fff
    style G fill:#2196F3,color:#fff
```

**Descripción del Flujo:**
1. **Webhook Trigger**: Recibe POST de Telegram
2. **Parse Message**: Valida chat_id y texto (NN_02)
3. **AI Agent**: Detecta intención del usuario (NN_03)
4. **Execute Action**: Ejecuta booking-orchestrator
5. **Send Response**: Envía confirmación por Telegram

---

## 2. Booking Orchestrator Flow (WF2 Equivalente)

```mermaid
flowchart TD
    A[Inicio Booking] --> B[circuit-breaker-check]
    B --> C{Servicio OK?}
    
    C -->|❌ Open| D[❌ Error: Service Unavailable]
    C -->|✅ Closed/Half-Open| E[distributed-lock-acquire]
    
    E --> F{Lock Adquirido?}
    F -->|❌ No| G[❌ Error: Time Slot Occupied]
    F -->|✅ Sí| H[availability-check]
    
    H --> I{Disponible?}
    I -->|❌ No| J[Release Lock]
    J --> K[❌ Error: No Availability]
    
    I -->|✅ Sí| L[gcal-create-event]
    L --> M{GCal OK?}
    M -->|❌ No| N[Record Failure + Rollback]
    N --> O[❌ Error: GCal Failed]
    
    M -->|✅ Sí| P[circuit-breaker-record Success]
    P --> Q[db-create-booking]
    
    Q --> R{DB OK?}
    R -->|❌ No| S[Rollback: Delete GCal + Release Lock]
    S --> T[❌ Error: DB Failed]
    
    R -->|✅ Sí| U[distributed-lock-release]
    U --> V[✅ Booking Confirmado]
    
    style A fill:#2196F3,color:#fff
    style V fill:#4CAF50,color:#fff
    style D fill:#f44336,color:#fff
    style G fill:#f44336,color:#fff
    style K fill:#f44336,color:#fff
    style O fill:#f44336,color:#fff
    style T fill:#f44336,color:#fff
```

**Pasos del Orchestrator:**
1. **Circuit Breaker Check**: Verifica si GCal está saludable
2. **Distributed Lock**: Bloquea el time slot (5 min)
3. **Availability Check**: Verifica disponibilidad real
4. **GCal Create Event**: Crea evento en Google Calendar
5. **Circuit Breaker Record**: Registra éxito
6. **DB Create Booking**: Guarda en PostgreSQL
7. **Lock Release**: Libera el lock

---

## 3. Circuit Breaker Pattern

```mermaid
stateDiagram-v2
    [*] --> Closed: Inicio
    
    Closed --> Closed: ✅ Éxito
    Closed --> Open: ❌ 5 fallos
    
    Open --> Open: 🔒 Bloqueado
    Open --> HalfOpen: ⏰ 300s timeout
    
    HalfOpen --> HalfOpen: ❌ Fallo
    HalfOpen --> Closed: ✅ 3 éxitos
    HalfOpen --> Open: ❌ Fallo
    
    note right of Closed
        Estado normal
        Las requests pasan
    end note
    
    note right of Open
        Estado de protección
        Las requests fallan
        inmediatamente
    end note
    
    note right of HalfOpen
        Estado de prueba
        Permite algunas
        requests para testear
    end note
```

**Estados:**
- **Closed**: Normal, todas las requests pasan
- **Open**: Protección activa, todas las requests fallan
- **Half-Open**: Prueba, permite algunas requests

---

## 4. Distributed Lock Pattern

```mermaid
sequenceDiagram
    participant U as Usuario A
    participant L as Lock Service
    participant D as Database
    participant G as Google Calendar
    
    U->>L: acquire_lock(provider_1_10:00)
    L->>L: Check if lock exists
    L-->>U: ✅ Lock granted (5 min)
    
    U->>D: Check availability
    D-->>U: ✅ Available
    
    U->>G: Create GCal event
    G-->>U: ✅ Event created
    
    U->>D: Create booking
    D-->>U: ✅ Booking saved
    
    U->>L: release_lock(provider_1_10:00)
    L-->>U: ✅ Lock released
    
    Note over U,L: Si algún paso falla:<br/>Rollback + Release Lock
```

**Características del Lock:**
- **Key**: `lock_{provider_id}_{start_time}`
- **Duración**: 5 minutos
- **Auto-release**: Expira automáticamente
- **Owner token**: UUID para validar ownership

---

## 5. AI Agent Intent Detection

```mermaid
flowchart LR
    A[Mensaje Usuario] --> B[Pre-procesamiento]
    B --> C[Extracción Keywords]
    C --> D{Pattern Matching}
    
    D -->|"reservar, agendar"| E[create_appointment]
    D -->|"cancelar, anular"| F[cancel_appointment]
    D -->|"reprogramar, cambiar"| G[reschedule_appointment]
    D -->|"disponibilidad, hueco"| H[check_availability]
    D -->|"hola, buenos"| I[greeting]
    D -->|"gracias"| J[thank_you]
    D -->|"adiós, chao"| K[farewell]
    D -->|Sin match| L[unknown]
    
    E --> M[Extraer Entidades]
    F --> M
    G --> M
    H --> M
    
    M --> N{provider_id?}
    N -->|Sí| O[Asignar provider_id]
    N -->|No| P[Default: 1]
    
    M --> Q{service_id?}
    Q -->|Sí| R[Asignar service_id]
    Q -->|No| S[Default: 1]
    
    M --> T{date/time?}
    T -->|Sí| U[Parsear fecha/hora]
    T -->|No| V[null]
    
    O --> W[Retornar Intent + Entities]
    P --> W
    R --> W
    S --> W
    U --> W
    V --> W
    
    style A fill:#4CAF50,color:#fff
    style W fill:#2196F3,color:#fff
```

**Intenciones Soportadas:**
| Intención | Keywords | Acción |
|-----------|----------|--------|
| `create_appointment` | reservar, agendar, citar | Crear booking |
| `cancel_appointment` | cancelar, anular, eliminar | Cancelar booking |
| `reschedule_appointment` | reprogramar, cambiar, mover | Reschedule booking |
| `check_availability` | disponibilidad, hueco, libre | Check availability |
| `greeting` | hola, buenos días/tardes | Saludo |
| `thank_you` | gracias, agradezco | Agradecimiento |
| `farewell` | adiós, chao, hasta luego | Despedida |

---

## 6. Rollback Workflow (WF6 Equivalente)

```mermaid
flowchart TD
    A[Fallo Detectado] --> B{Qué falló?}
    
    B -->|GCal Error| C[Skip: GCal ya falló]
    B -->|DB Error| D[Delete GCal Event]
    B -->|Lock Error| E[Force Release Lock]
    
    C --> F[Release Lock]
    D --> F
    E --> G[Log to DLQ]
    
    F --> G
    G --> H[Return Error Response]
    
    subgraph DLQ [Dead Letter Queue]
        G
    end
    
    style A fill:#f44336,color:#fff
    style H fill:#f44336,color:#fff
    style G fill:#FF9800,color:#fff
```

**Pasos del Rollback:**
1. **Detectar fallo**: En qué paso falló?
2. **Delete GCal**: Si se creó evento, eliminarlo
3. **Release Lock**: Liberar time slot
4. **Log to DLQ**: Registrar para debugging
5. **Error Response**: Retornar error al usuario

---

## 7. Message Processing Pipeline

```mermaid
flowchart LR
    A[Telegram Message] --> B[NN_02: Parse Message]
    
    B --> C{Validación}
    C -->|❌ Invalid| D[Error Response]
    C -->|✅ Valid| E[NN_03: AI Agent]
    
    E --> F{Intent Detection}
    F -->|Booking Intent| G[WF2: Orchestrator]
    F -->|Info Intent| H[Get Providers/Services]
    F -->|Chat Intent| I[Direct Response]
    
    G --> J[NN_04: Telegram Send]
    H --> J
    I --> J
    
    J --> K[✅ Done]
    
    style A fill:#4CAF50,color:#fff
    style K fill:#4CAF50,color:#fff
    style G fill:#2196F3,color:#fff
```

---

## 8. Sistema Completo - Vista de Arquitectura

```mermaid
flowchart TB
    subgraph External [Servicios Externos]
        T[Telegram API]
        G[Google Calendar]
        M[Gmail SMTP]
    end
    
    subgraph Cloudflare [Cloudflare Tunnel]
        CF[windmill.stax.ink]
    end
    
    subgraph API [API Gateway :8080]
        WH[Webhook Handler]
        BA[Booking API]
        HA[Health Check]
    end
    
    subgraph Windmill [Windmill Platform]
        subgraph Flows [Flows]
            TWF[telegram-webhook__flow]
        end
        
        subgraph Scripts [Scripts]
            MP[message_parser]
            AA[ai_agent]
            BO[booking-orchestrator]
            TS[telegram-send]
            AC[availability-check]
            CB[circuit-breaker]
            DL[distributed-lock]
            GC[gcal-create]
            GM[gmail-send]
        end
    end
    
    subgraph Data [Persistencia]
        PG[(PostgreSQL)]
        RD[(Redis)]
    end
    
    T --> CF
    CF --> WH
    WH --> TWF
    TWF --> MP
    MP --> AA
    AA --> BO
    BO --> TS
    TS --> T
    
    BO --> AC
    BO --> CB
    BO --> DL
    BO --> GC
    GC --> G
    
    BO --> GM
    GM --> M
    
    MP --> PG
    AA --> PG
    BO --> PG
    AC --> PG
    DL --> RD
    
    style T fill:#0088cc,color:#fff
    style G fill:#4285F4,color:#fff
    style M fill:#EA4335,color:#fff
    style PG fill:#336791,color:#fff
    style RD fill:#DC382D,color:#fff
```

---

## Cómo Ver Estos Diagramas

### Opción 1: GitHub
Los archivos `.md` con Mermaid se renderizan automáticamente en GitHub.

### Opción 2: VS Code
Instala la extensión:
- **Markdown Preview Mermaid Support**

### Opción 3: Mermaid Live Editor
Copia el código y pégalo en:
- https://mermaid.live/

### Opción 4: Windmill UI
Para ver los flujos reales:
1. Ve a `https://windmill.stax.ink`
2. Navega a `f/telegram-webhook__flow`
3. Click en "Flow" tab para ver el diagrama visual

---

**Última actualización:** 2026-03-26
**Mantenido por:** Booking Titanium Team
