# Guía de Ejecución Local + Configuración Telegram

## 1. Ejecutar en Local

### Requisitos
- Docker + Docker Compose
- Node.js 20+ (para scripts de setup)
- Bun (runtime de los scripts TypeScript)

### Paso 1: Variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus valores reales:

```bash
# ─── Base de Datos ───
DATABASE_URL=postgresql://booking:booking123@localhost:5432/bookings

# ─── Redis (opcional, para cache semántico) ───
REDIS_URL=redis://localhost:6379

# ─── Telegram Bot ───
TELEGRAM_BOT_TOKEN=tu_token_aqui
TELEGRAM_WEBHOOK_SECRET=un_secreto_aleatorio

# ─── Google Calendar ───
GCAL_ACCESS_TOKEN=tu_token_aqui
GCAL_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

# ─── Gmail ───
GMAIL_USER=tu_email@gmail.com
GMAIL_PASSWORD=tu_app_password

# ─── AI ───
GROQ_API_KEY=gsk_tu_key_aqui
GROQ_API_KEY_2=gsk_tu_segunda_key
OPENAI_API_KEY=sk-tu_key_aqui

# ─── Windmill ───
WINDMILL_BASE_URL=https://windmill.stax.ink
WINDMILL_WORKSPACE=tu-workspace
WINDMILL_TOKEN=wm_tu_token
```

### Paso 2: Levantar infraestructura

```bash
# Solo PostgreSQL + Redis (sin Windmill, que corre en la nube)
docker compose up -d postgres redis
```

Si no tienes `docker-compose.yml`, créalo:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:17-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: booking
      POSTGRES_PASSWORD: booking123
      POSTGRES_DB: bookings
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  pg_data:
  redis_data:
```

### Paso 3: Ejecutar migraciones

```bash
# Las migraciones se ejecutan automáticamente al iniciar el contenedor
# Si necesitas ejecutarlas manualmente:
docker compose exec postgres psql -U booking -d bookings -f /docker-entrypoint-initdb.d/001_initial_schema.sql
docker compose exec postgres psql -U booking -d bookings -f /docker-entrypoint-initdb.d/002_add_booking_locks.sql
docker compose exec postgres psql -U booking -d bookings -f /docker-entrypoint-initdb.d/003_add_dlq.sql
docker compose exec postgres psql -U booking -d bookings -f /docker-entrypoint-initdb.d/004_scheduling_engine.sql
```

### Paso 4: Ejecutar scripts localmente (sin Windmill)

Para probar un script directamente con Bun:

```bash
# Health check
DATABASE_URL="postgresql://booking:booking123@localhost:5432/bookings" \
bun run f/health_check/main.ts

# Availability check
DATABASE_URL="postgresql://booking:booking123@localhost:5432/bookings" \
bun run f/availability_check/main.ts \
  '{"provider_id": "<UUID>", "date": "2026-04-04"}'

# AI Agent
DATABASE_URL="postgresql://booking:booking123@localhost:5432/bookings" \
GROQ_API_KEY="gsk_tu_key" \
bun run f/internal/ai_agent/main.ts \
  '{"chat_id": "123456", "text": "hola, quiero agendar una cita"}'

# Provider Dashboard API
DATABASE_URL="postgresql://booking:booking123@localhost:5432/bookings" \
bun run f/provider_dashboard/main.ts \
  '{"action": "get_provider"}'
```

### Paso 5: Abrir el dashboard provider

```bash
# Opción A: Abrir directamente el archivo HTML
open web/provider-dashboard/index.html

# Opción B: Servir con un servidor local
npx serve web/provider-dashboard
# Luego abre http://localhost:3000
```

Ingresa tus credenciales de Windmill en el formulario de configuración.

---

## 2. Configurar Telegram Bot

### Paso 1: Crear el bot con BotFather

1. Abre Telegram y busca **@BotFather**
2. Envía `/newbot`
3. Elige un nombre: `MiClinicaBot`
4. Elige un username: `mi_clinica_booking_bot` (debe terminar en `bot`)
5. **Copia el token** que te da: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`

### Paso 2: Configurar el webhook en Telegram

El webhook debe apuntar a tu instancia de Windmill. Telegram envía un POST a esa URL cada vez que un usuario escribe al bot.

```bash
BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
WEBHOOK_URL="https://windmill.stax.ink/api/w/tu-workspace/flows/trigger/f/telegram-webhook-flow"
SECRET_TOKEN="un_secreto_aleatorio_32_chars"

curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${WEBHOOK_URL}\",
    \"secret_token\": \"${SECRET_TOKEN}\",
    \"allowed_updates\": [\"message\", \"callback_query\"]
  }"
```

**Respuesta esperada:**
```json
{"ok": true, "result": true, "description": "Webhook was set"}
```

### Paso 3: Verificar el webhook

```bash
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
```

**Respuesta esperada:**
```json
{
  "ok": true,
  "result": {
    "url": "https://windmill.stax.ink/api/w/...",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": 0,
    "allowed_updates": ["message", "callback_query"]
  }
}
```

### Paso 4: Crear el flow en Windmill

En Windmill, crea un **Flow** que orqueste la conversación:

**Ruta:** `f/telegram-webhook-flow`

```
Trigger (Webhook)
    ↓
Conversation Logger (log del mensaje)
    ↓
AI Agent (detección de intent)
    ↓
┌─── intent = greeting? ──→ Telegram Send (respuesta saludo)
├─── intent = list_available? ──→ Availability Check → Telegram Send (slots)
├─── intent = create_booking? ──→ Booking Create → GCal Sync → Gmail Send → Telegram Send (confirmación)
├─── intent = cancel_booking? ──→ Booking Cancel → GCal Delete → Telegram Send (cancelación)
└─── intent = general_question? ──→ RAG Query → Telegram Send (respuesta)
```

### Paso 5: Configurar variables en Windmill

En Windmill → Settings → Variables:

| Variable | Valor |
|----------|-------|
| `TELEGRAM_BOT_TOKEN` | `123456789:ABCdef...` |
| `TELEGRAM_WEBHOOK_SECRET` | `un_secreto_aleatorio_32_chars` |
| `DATABASE_URL` | `postgresql://...` |
| `GROQ_API_KEY` | `gsk_...` |
| `GCAL_ACCESS_TOKEN` | `ya29...` |

### Paso 6: Probar

1. Abre Telegram y busca tu bot por username
2. Envía `/start`
3. El bot debería responder con el menú principal
4. Prueba: "quiero agendar una cita para mañana"

### Debug: Si el bot no responde

```bash
# 1. Verificar que el webhook está activo
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"

# 2. Verificar que Windmill recibe requests
# Revisa los logs del flow en Windmill UI

# 3. Probar el webhook manualmente
curl -X POST "${WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: ${SECRET_TOKEN}" \
  -d '{
    "update_id": 1,
    "message": {
      "message_id": 1,
      "from": {"id": 123456, "first_name": "Test"},
      "chat": {"id": 123456, "type": "private"},
      "date": 1712000000,
      "text": "hola"
    }
  }'

# 4. Verificar que el bot token es correcto
curl "https://api.telegram.org/bot${BOT_TOKEN}/getMe"
```

---

## 3. Estructura de Archivos Clave

```
booking-titanium-wm/
├── .env                          # Variables de entorno (NO commitear)
├── .env.example                  # Template de variables
├── .env.test                     # Variables para tests
├── docker-compose.yml            # Infraestructura local (Postgres + Redis)
├── migrations/                   # Migraciones de DB
│   ├── 001_initial_schema.sql
│   ├── 002_add_booking_locks.sql
│   ├── 003_add_dlq.sql
│   └── 004_scheduling_engine.sql
├── f/                            # Scripts de Windmill
│   ├── availability_check/       # Consultar disponibilidad
│   ├── booking_create/           # Crear reserva
│   ├── booking_cancel/           # Cancelar reserva
│   ├── provider_dashboard/       # API del dashboard provider
│   ├── internal/
│   │   ├── ai_agent/             # Detección de intents con LLM
│   │   ├── scheduling-engine/    # Motor de disponibilidad (3 capas)
│   │   ├── cache/                # Semantic cache con Redis
│   │   └── db-types/             # Interfaces tipadas de DB
│   └── ...
├── web/provider-dashboard/       # Frontend del proveedor
│   └── index.html                # Dashboard 100% real, sin mocks
├── tests/
│   ├── setup-db.ts               # Setup de testcontainers
│   └── db-integration.test.ts    # 21 tests de integración
└── docs/
    └── session-context.md        # Contexto de la sesión
```

---

## 4. Comandos Rápidos

```bash
# Levantar infraestructura local
docker compose up -d postgres redis

# Ejecutar todos los tests
npm run test

# Typecheck
npx tsc --noEmit -p tsconfig.strict.json

# Lint
npx eslint f/ --max-warnings 0

# Probar script localmente
DATABASE_URL="postgresql://booking:booking123@localhost:5432/bookings" \
bun run f/health_check/main.ts

# Abrir dashboard provider
open web/provider-dashboard/index.html

# Ver logs de PostgreSQL
docker compose logs -f postgres

# Resetear base de datos (CUIDADO: borra todo)
docker compose down -v && docker compose up -d postgres
```
