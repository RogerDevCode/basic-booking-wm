# 📡 Telegram Webhook Setup Guide

**Estado:** ✅ Implementado
**Versión:** 1.0.0

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                    Telegram Servers                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ POST /api/telegram/webhook
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Cloudflare Tunnel (windmill.stax.ink)              │
│                   HTTPS → http://api:8080                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              API Gateway (cmd/api/main.go:8080)                 │
│         telegramWebhookHandler() - Parse Telegram payload       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Windmill Flow (telegram-webhook__flow)             │
│    1. parse_message → 2. ai_agent → 3. booking-orchestrator    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              telegram-send (confirmación al usuario)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Prerrequisitos

1. ✅ **Bot de Telegram creado** en [@BotFather](https://t.me/BotFather)
2. ✅ **TELEGRAM_BOT_TOKEN** configurado en `.env`
3. ✅ **API Gateway** corriendo en puerto 8080
4. ✅ **Cloudflare Tunnel** configurado (windmill.stax.ink)
5. ✅ **Windmill Flow** `telegram-webhook__flow` creado

---

## 🚀 Setup Paso a Paso

### 1. Configurar Environment Variables

```bash
# Editar .env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
WINDMILL_API_URL=https://windmill.stax.ink
WINDMILL_API_KEY=wm_xxx
```

### 2. Deploy del Flow a Windmill

```bash
# Desde la raíz del proyecto
cd f/telegram-webhook__flow

# Generar locks para las dependencias
wmill flow generate-locks . --yes

# Push del flow a Windmill
wmill sync push
```

### 3. Obtener Webhook URL de Windmill

Después del push, el flow tendrá un trigger HTTP. Para obtener la URL:

```bash
# Listar flows y obtener el ID
wmill flow list

# O ver en la UI de Windmill: https://windmill.stax.ink
# Ir a: f/telegram-webhook__flow → Triggers → HTTP Webhook URL
```

La URL será algo como:
```
https://windmill.stax.ink/api/w/f/telegram-webhook__flow
```

### 4. Configurar Webhook en Telegram

```bash
# Reemplazar <BOT_TOKEN> y <WEBHOOK_URL>
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://windmill.stax.ink/api/telegram/webhook",
    "allowed_updates": ["message", "channel_post"]
  }'
```

### 5. Verificar Webhook

```bash
# Verificar estado del webhook
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

Respuesta esperada:
```json
{
  "ok": true,
  "result": {
    "url": "https://windmill.stax.ink/api/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": 0,
    "last_error_message": "",
    "max_connections": 40,
    "allowed_updates": ["message", "channel_post"]
  }
}
```

---

## 🧪 Testing

### 1. Enviar mensaje de prueba al bot

```
Hola, quiero reservar una cita para mañana
```

### 2. Ver logs del API

```bash
# Ver logs en tiempo real
docker-compose logs -f api

# O si estás corriendo local
go run ./cmd/api/main.go
```

Logs esperados:
```
[Telegram Webhook] Received message from chat_id=123456789, text="Hola, quiero reservar una cita para mañana"
```

### 3. Verificar ejecución en Windmill

Ir a: https://windmill.stax.ink → Executions → Ver última ejecución del flow

---

## 🔧 Integración con Windmill Flow

### Opción A: Llamar Flow desde API (Recomendado)

En `telegramWebhookHandler()`, después de parsear el payload:

```go
import (
    "bytes"
    "encoding/json"
    "net/http"
    "os"
)

// ... después de validar el mensaje ...

// Preparar payload para Windmill
windmillPayload := map[string]any{
    "chat_id": message.Chat.ID,
    "text":    message.Text,
    "username": message.From.FirstName,
}

// Obtener config de Windmill
windmillURL := os.Getenv("WINDMILL_API_URL") + "/api/w/f/telegram-webhook__flow"
windmillKey := os.Getenv("WINDMILL_API_KEY")

// Serializar payload
payloadJSON, _ := json.Marshal(windmillPayload)

// Crear request a Windmill
req, _ := http.NewRequest("POST", windmillURL, bytes.NewBuffer(payloadJSON))
req.Header.Set("Authorization", "Bearer " + windmillKey)
req.Header.Set("Content-Type", "application/json")

// Ejecutar flow (async, no bloqueante)
client := &http.Client{Timeout: 5 * time.Second}
resp, err := client.Do(req)
if err != nil {
    log.Printf("[Telegram Webhook] Windmill error: %v", err)
}
defer resp.Body.Close()
```

### Opción B: Procesamiento Local (Más rápido)

Usar los paquetes internos directamente:

```go
import (
    "booking-titanium-wm/internal/message"
    "booking-titanium-wm/internal/ai"
    "booking-titanium-wm/internal/booking"
)

// 1. Parsear mensaje
parseReq := message.ParseRequest{
    ChatID: strconv.Itoa(message.Chat.ID),
    Text:   message.Text,
}
parseResp := message.Parse(parseReq)

if !parseResp.Success {
    // Enviar error por Telegram
    return
}

// 2. Detectar intención con AI
aiReq := ai.AIAgentRequest{
    ChatID: parseResp.Data.ChatID,
    Text:   parseResp.Data.Text,
}
aiResp := ai.AIAgent(aiReq)

// 3. Ejecutar acción según intención
if aiResp.Data.Intent == "create_appointment" {
    bookingReq := booking.CreateBookingRequest{
        // ... extraer entidades de aiResp.Data.Entities
    }
    bookingResp := booking.CreateBooking(bookingReq)
    
    // 4. Enviar confirmación
    telegram.SendTelegramBookingConfirmation(
        parseResp.Data.ChatID,
        bookingResp.Data.ID,
        // ...
    )
}
```

---

## 📊 Flujo Completo

### 1. Usuario envía mensaje
```
Usuario → Bot de Telegram
"Quiero reservar una cita con el proveedor 1 para mañana a las 3pm"
```

### 2. Telegram envía webhook
```json
POST https://windmill.stax.ink/api/telegram/webhook
{
  "update_id": 123456789,
  "message": {
    "chat": {"id": 987654321},
    "text": "Quiero reservar una cita...",
    "from": {"first_name": "Juan"}
  }
}
```

### 3. API parsea y procesa
```
telegramWebhookHandler()
  → message.Parse() ✅
  → ai.AIAgent() ✅ (intent: create_appointment)
  → booking.CreateBooking() ✅
  → telegram.SendMessage() ✅
```

### 4. Respuesta al usuario
```
✅ Reserva Confirmada

ID: BK-123456
Proveedor: Dr. García
Servicio: Consulta General
Fecha: 2026-03-27T15:00:00Z

Gracias por confiar en nosotros! 🎉
```

---

## 🔐 Seguridad

### 1. Validar que el webhook viene de Telegram

Telegram envía un header `X-Telegram-Bookkeeping` o puedes validar el IP:

```go
// Lista de IPs de Telegram (actualizar periódicamente)
telegramIPs := []string{
    "149.154.167.0/24",
    "149.154.164.0/24",
    // ... verificar https://core.telegram.org/bots/webhooks
}
```

### 2. Rate Limiting

El nginx ya tiene rate limiting configurado (10 req/s).

### 3. Validar chat_id permitido

```go
// Solo permitir chats conocidos
allowedChats := map[int]bool{
    123456789: true,
    987654321: true,
}

if !allowedChats[message.Chat.ID] {
    log.Printf("Chat no autorizado: %d", message.Chat.ID)
    return
}
```

---

## 🚨 Troubleshooting

### Webhook no recibe mensajes

```bash
# Verificar estado
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Si hay error, remover y volver a setear
curl -X POST "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://windmill.stax.ink/api/telegram/webhook"
```

### API no responde

```bash
# Verificar logs
docker-compose logs api

# Verificar health
curl http://localhost:8080/health

# Reiniciar contenedor
docker-compose restart api
```

### Windmill Flow no se ejecuta

```bash
# Verificar logs en Windmill UI
# Ir a: f/telegram-webhook__flow → Executions

# Verificar permisos de API Key
# Ir a: Settings → API Keys
```

---

## 📝 Comandos Útiles

```bash
# Set webhook
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://windmill.stax.ink/api/telegram/webhook"

# Get webhook info
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo" | jq

# Delete webhook
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"

# Get updates (polling, para testing)
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates" | jq
```

---

## 🔄 Migración desde n8n

| n8n Node | Windmill Equivalent |
|----------|---------------------|
| Webhook (NN_01) | telegramWebhookHandler() + HTTP Trigger |
| Parse (NN_02) | f/internal/message_parser |
| AI Agent (NN_03) | f/internal/ai_agent |
| Telegram Sender (NN_04) | f/telegram-send |

---

**Última actualización:** 2026-03-26
**Mantenido por:** Booking Titanium Team
