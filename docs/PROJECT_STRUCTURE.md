# 📁 Estructura del Proyecto Windmill

```
booking-titanium-wm/
│
├── 📂 .windmill/                    # Configuración de Windmill
│   └── workspace.json               # Workspace settings
│
├── 📂 .idea/                        # GoLand IDE Configuration
│   ├── booking-titanium-wm.iml     # Module file
│   ├── misc.xml                     # Project settings
│   └── modules.xml                  # Modules configuration
│
├── 📂 scripts/                      # Windmill Scripts (TypeScript)
│   │
│   ├── 📂 core/                     # Scripts core reutilizables
│   │   ├── README.md
│   │   ├── db.ts                    # → Database connection & queries
│   │   ├── validators.ts            # → Input validation functions
│   │   ├── standard_contract.ts     # → Response format
│   │   ├── error_handlers.ts        # → Error handling
│   │   └── types.ts                 # → TypeScript types
│   │
│   ├── 📂 booking/                  # Gestión de reservas
│   │   ├── README.md
│   │   ├── create.ts                # → Crear reserva
│   │   ├── cancel.ts                # → Cancelar reserva
│   │   ├── reschedule.ts            # → Reagendar reserva
│   │   ├── get_by_id.ts             # → Obtener por ID
│   │   └── get_by_chat_id.ts        # → Obtener por chat_id
│   │
│   ├── 📂 availability/             # Servicios de disponibilidad
│   │   ├── README.md
│   │   ├── check.ts                 # → Verificar disponibilidad
│   │   ├── next_available.ts        # → Próximo disponible
│   │   └── gcal_collision.ts        # → Colisiones GCal
│   │
│   ├── 📂 providers/                # Gestión de proveedores
│   │   ├── README.md
│   │   ├── get_providers.ts         # → Listar proveedores
│   │   ├── get_services.ts          # → Listar servicios
│   │   └── providers_by_service.ts  # → Proveedores por servicio
│   │
│   ├── 📂 ai/                       # Agentes AI
│   │   ├── README.md
│   │   ├── message_parser.ts        # → Parsear mensajes
│   │   ├── pipeline_agent.ts        # → Pipeline de intents
│   │   └── ai_agent.ts              # → Agente IA principal
│   │
│   ├── 📂 communication/            # Comunicación externa
│   │   ├── README.md
│   │   ├── telegram_send.ts         # → Enviar Telegram
│   │   ├── gmail_send.ts            # → Enviar Gmail
│   │   └── gcal_delete.ts           # → Eliminar GCal event
│   │
│   ├── 📂 infrastructure/           # Infraestructura
│   │   ├── README.md
│   │   ├── circuit_breaker.ts       # → Circuit breaker
│   │   ├── distributed_lock.ts      # → Locks distribuidos
│   │   ├── rollback.ts              # → Rollback operaciones
│   │   └── dlq.ts                   # → Dead Letter Queue
│   │
│   ├── 📂 rag/                      # RAG / Vector search
│   │   ├── README.md
│   │   ├── ingest.ts                # → Ingesta documentos
│   │   └── retrieve.ts              # → Búsqueda vectorial
│   │
│   └── 📂 seed/                     # Provisioning de slots
│       ├── README.md
│       ├── daily_provisioning.ts    # → Provisioning diario
│       └── process_slot.ts          # → Procesar slot individual
│
├── 📂 flows/                        # Flows de orquestación
│   ├── booking_orchestrator.ts      # → Orquestador principal
│   ├── api_gateway.ts               # → API Gateway
│   ├── check_availability.ts        # → Check disponibilidad
│   └── reminder_cron.ts             # → Recordatorios cron
│
├── 📂 apps/                         # Apps UI (opcional)
│   └── (dashboard apps)
│
├── 📂 resources/                    # Resource definitions
│   ├── postgres.json                # → PostgreSQL connection
│   ├── telegram.json                # → Telegram bot
│   ├── google_oauth2.json           # → Google OAuth2
│   └── openai.json                  # → OpenAI API key
│
├── 📂 tests/                        # Tests unitarios y de integración
│   ├── unit/
│   │   ├── booking/
│   │   ├── availability/
│   │   └── infrastructure/
│   ├── integration/
│   │   ├── booking.test.ts
│   │   └── orchestrator.test.ts
│   └── e2e/
│       └── full_booking.test.ts
│
├── 📂 docs/                         # Documentación
│   ├── architecture.md              # → Arquitectura del sistema
│   ├── migration-plan.md            # → Plan de migración n8n
│   ├── api-reference.md             # → API documentation
│   └── deployment.md                # → Deployment guide
│
├── 📂 temp/                         # Archivos temporales (.gitignored)
│   └── (temporary files)
│
├── .env.example                     # Environment variables template
├── .gitignore                       # Git ignore rules
├── package.json                     # NPM dependencies
├── tsconfig.json                    # TypeScript configuration
└── README.md                        # Project documentation
```

---

## 📊 Estadísticas de la Estructura

| Directorio | Propósito | Scripts Estimados |
|------------|-----------|-------------------|
| `scripts/core/` | Utilidades compartidas | 5 |
| `scripts/booking/` | Reservas | 5 |
| `scripts/availability/` | Disponibilidad | 3 |
| `scripts/providers/` | Proveedores | 3 |
| `scripts/ai/` | Agentes AI | 3 |
| `scripts/communication/` | Comunicación | 3 |
| `scripts/infrastructure/` | Infraestructura | 4 |
| `scripts/rag/` | RAG | 2 |
| `scripts/seed/` | Provisioning | 2 |
| `flows/` | Orquestación | 4 |
| **Total** | | **~34 scripts** |

---

## 🔧 Configuración GoLand Incluida

- ✅ `misc.xml` - Configuración del proyecto
- ✅ `modules.xml` - Módulos del proyecto
- ✅ `booking-titanium-wm.iml` - Module file con paths configurados
- ✅ TypeScript habilitado
- ✅ Node.js habilitado
- ✅ Path aliases configurados (`@core/*`, `@booking/*`, etc.)

---

**Estructura creada:** 2026-03-24  
**Lista para:** Comenzar desarrollo con GoLand
