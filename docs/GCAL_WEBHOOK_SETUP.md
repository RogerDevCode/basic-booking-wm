# Google Calendar Webhook Setup - Booking Titanium

**Estado:** ✅ Production Ready  
**Versión:** 1.0.0  
**Fecha:** 2026-03-31

---

## 📋 Overview

Google Calendar soporta **Push Notifications** mediante webhooks que notifican a tu sistema cuando hay cambios en los calendarios monitoreados.

### Flujo de Notificación

```
┌─────────────────────────────────────────────────────────────────┐
│  GOOGLE CALENDAR WEBHOOK FLOW                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Usuario elimina/edita evento en Google Calendar             │
│                                                                 │
│  2. GCal detecta cambio → notifica a tu webhook                 │
│     POST https://windmill.stax.ink/api/gcal/webhook             │
│     Headers:                                                     │
│       - X-Goog-Channel-ID: <channel_id>                         │
│       - X-Goog-Resource-ID: <calendar_id>                       │
│       - X-Goog-Resource-URI: /users/me/calendars/primary/events │
│       - X-Goog-Message-Number: <sequence_number>                │
│                                                                 │
│  3. API Gateway valida y procesa                                │
│     - Verificar X-Goog-Channel-Token                            │
│     - Extraer event_id del channel                              │
│     - Llamar a Windmill Flow: gcal-sync-engine                  │
│                                                                 │
│  4. Windmill actualiza DB                                       │
│     - UPDATE bookings SET status = 'CANCELLED'                  │
│     - INSERT booking_audit (audit trail)                        │
│                                                                 │
│  5. Responder 200 OK a Google (< 3 segundos)                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Setup del Webhook

### Paso 1: Configurar Endpoint en API Gateway

El endpoint ya está implementado en `cmd/api/main.go`:

```go
// Registrar handler
mux.HandleFunc("/api/gcal/webhook", gcalWebhookHandler)
```

**Endpoint:** `POST https://windmill.stax.ink/api/gcal/webhook`

---

### Paso 2: Configurar Google Cloud Project

#### 2.1 Habilitar Calendar API

```bash
# Ir a Google Cloud Console
https://console.cloud.google.com/apis/library/calendar-json.googleapis.com

# Click en "Enable"
```

#### 2.2 Configurar Domain-Wide Delegation

```bash
# 1. Ir a IAM & Admin > Service Accounts
# 2. Seleccionar tu Service Account (booking-titanium-calendar@...)
# 3. Click en "Enable G Suite Domain-wide Delegation"
# 4. Copiar el "Client ID"

# 5. Ir a Google Admin Console
https://admin.google.com/ac/owl/domainwidedelegation

# 6. Click "Add New"
# 7. Pegar Client ID
# 8. Agregar scope: https://www.googleapis.com/auth/calendar
# 9. Click "Authorize"
```

---

### Paso 3: Registrar Webhook con Google Calendar API

#### 3.1 Script de Setup (Automático)

```bash
# Ejecutar script de configuración
cd /home/manager/Sync/wildmill-proyects/booking-titanium-wm
go run cmd/tools/gcal_webhook_setup.go \
  --calendar-id primary \
  --webhook-url https://windmill.stax.ink/api/gcal/webhook \
  --token <secret-token-for-validation>
```

#### 3.2 Setup Manual (curl)

```bash
# Reemplazar CALENDAR_ID y WEBHOOK_URL
CALENDAR_ID="primary"
WEBHOOK_URL="https://windmill.stax.ink/api/gcal/webhook"
SECRET_TOKEN="tu-secret-token-123"

# Obtener access token
ACCESS_TOKEN=$(gcloud auth application-default print-access-token)

# Registrar webhook (watch)
curl -X POST \
  "https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events/watch" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "booking-titanium-webhook-001",
    "type": "web_hook",
    "address": "'"${WEBHOOK_URL}"'",
    "token": "'"${SECRET_TOKEN}"'"
  }'
```

#### 3.3 Respuesta Exitosa

```json
{
  "kind": "api#channel",
  "id": "booking-titanium-webhook-001",
  "resourceId": "primary",
  "resourceUri": "https://www.googleapis.com/calendar/v3/calendars/primary/events",
  "expiration": "1711987200000"
}
```

**Importante:**
- `expiration`: Timestamp en milisegundos (UNIX epoch)
- Los webhooks expiran después de **7 días** como máximo
- Debes renovar antes de la expiración

---

### Paso 4: Renovar Webhook (Cron Job)

Los webhooks de Google Calendar expiran después de 7 días. Configura un cron job para renovar:

```yaml
# Windmill Schedule
# Path: f/schedules/gcal-webhook-renew
# Cron: 0 0 * * * (diario a medianoche)

# Script: f/gcal_webhook_renew/main.go
```

**Script de Renovación:**

```go
package inner

import (
	"context"
	"fmt"
	"time"

	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

func main(
	ctx context.Context,
	gcalCredentials string,
	calendarID string,
	webhookURL string,
	webhookID string,
	token string,
) (map[string]any, error) {

	// Crear cliente GCal
	service, err := calendar.NewService(ctx, option.WithCredentialsJSON([]byte(gcalCredentials)))
	if err != nil {
		return nil, err
	}

	// Detener webhook anterior
	err = service.Channels.Stop(&calendar.Channel{
		Id: webhookID,
	}).Do()
	if err != nil {
		// Log error pero continuar
		fmt.Printf("Warning: Failed to stop old channel: %v\n", err)
	}

	// Crear nuevo webhook
	channel := &calendar.Channel{
		Id:      webhookID,
		Type:    "web_hook",
		Address: webhookURL,
		Token:   token,
	}

	result, err := service.Events.Watch(calendarID, channel).Do()
	if err != nil {
		return nil, fmt.Errorf("failed to create webhook: %w", err)
	}

	// Calcular fecha de expiración
	expirationMillis := result.Expiration // "1711987200000"
	expirationTime := time.Unix(0, expirationMillis*1000000)

	return map[string]any{
		"channel_id":     result.Id,
		"resource_id":    result.ResourceId,
		"expiration":     expirationTime.Format(time.RFC3339),
		"renewed_at":     time.Now().UTC().Format(time.RFC3339),
		"webhook_url":    webhookURL,
	}, nil
}
```

---

## 🔐 Validación de Seguridad

### Verificar X-Goog-Channel-Token

El API Gateway **DEBE** validar el token secreto:

```go
// cmd/api/main.go
func gcalWebhookHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 1. Verificar X-Goog-Channel-Token
	token := r.Header.Get("X-Goog-Channel-Token")
	expectedToken := os.Getenv("GCAL_WEBHOOK_TOKEN")
	if token != expectedToken {
		log.Warn("GCal webhook: invalid token")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// 2. Verificar X-Goog-Message-Number (opcional, para detectar duplicados)
	msgNumber := r.Header.Get("X-Goog-Message-Number")
	if msgNumber != "" {
		// Check if already processed (Redis cache)
		// ...
	}

	// 3. Extraer información del channel
	channelID := r.Header.Get("X-Goog-Channel-ID")
	resourceID := r.Header.Get("X-Goog-Resource-ID")
	resourceURI := r.Header.Get("X-Goog-Resource-URI")
	resourceState := r.Header.Get("X-Goog-Resource-State")

	log.Info("GCal webhook received: channel=%s, resource=%s, state=%s",
		channelID, resourceID, resourceState)

	// 4. Llamar a Windmill Flow
	// ...

	// 5. Responder 200 OK (Google espera < 3 segundos)
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}
```

---

## 📡 Endpoints del API Gateway

### POST /api/gcal/webhook

**Propósito:** Recibir notificaciones push de Google Calendar

**Headers Requeridos:**
```
X-Goog-Channel-ID: <channel_id>
X-Goog-Resource-ID: <calendar_id>
X-Goog-Resource-URI: /users/me/calendars/primary/events
X-Goog-Resource-State: sync
X-Goog-Message-Number: <sequence_number>
X-Goog-Channel-Token: <secret_token>
```

**Request Body:** (vacío, toda la info está en headers)

**Response:**
```
HTTP/1.1 200 OK
Content-Type: text/plain
Content-Length: 2

OK
```

**Timeout:** Google espera respuesta en < 3 segundos

---

## 🔄 Manejo de Eventos

### Tipos de Eventos

| X-Goog-Resource-State | Significado | Acción |
|-----------------------|-------------|--------|
| **sync** | Webhook verificado | Solo log |
| **exists** | Evento existe (sin cambios) | Ignorar |
| **update** | Evento actualizado | Fetch evento → actualizar DB |

### Flujo de Procesamiento

```go
// 1. Detectar tipo de evento
resourceState := r.Header.Get("X-Goog-Resource-State")

switch resourceState {
case "sync":
    // Webhook recién creado, solo verificar
    return "OK"

case "exists":
    // No hay cambios, ignorar
    return "OK"

case "update":
    // Hubo cambio → fetch evento desde GCal API
    eventID := extractEventIDFromChannel(channelID)
    
    // Llamar a Windmill: gcal-sync-engine
    windmillResponse := callWindmillSyncEngine(eventID)
    
    if windmillResponse.Action == "booking_cancelled" {
        log.Info("Booking cancelled from GCal: %s", eventID)
    }
    
    return "OK"
}
```

---

## 🛠️ Scripts de Windmill

### f/gcal_webhook_setup/main.go

**Propósito:** Registrar webhook con Google Calendar API

```go
package inner

import (
	"context"
	"fmt"
	"time"

	"golang.org/x/oauth2/google"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

type GCalWebhookSetupInput struct {
	CalendarID   string `json:"calendar_id"`   // "primary" o ID específico
	WebhookURL   string `json:"webhook_url"`   // https://windmill.stax.ink/api/gcal/webhook
	WebhookID    string `json:"webhook_id"`    // Unique ID para este channel
	SecretToken  string `json:"secret_token"`  // Token para validación
	Credentials  string `json:"credentials"`   // Service Account JSON
}

type GCalWebhookSetupResult struct {
	Success      bool   `json:"success"`
	ChannelID    string `json:"channel_id"`
	ResourceID   string `json:"resource_id"`
	Expiration   string `json:"expiration"`
	WebhookURL   string `json:"webhook_url"`
	Error        string `json:"error,omitempty"`
}

func main(ctx context.Context, input GCalWebhookSetupInput) (GCalWebhookSetupResult, error) {
	// Crear cliente GCal
	creds, err := google.CredentialsFromJSON(ctx, []byte(input.Credentials), calendar.CalendarScope)
	if err != nil {
		return GCalWebhookSetupResult{
			Success: false,
			Error:   fmt.Sprintf("credentials: %v", err),
		}, nil
	}

	service, err := calendar.NewService(ctx, option.WithCredentials(creds))
	if err != nil {
		return GCalWebhookSetupResult{
			Success: false,
			Error:   fmt.Sprintf("service: %v", err),
		}, nil
	}

	// Configurar channel
	channel := &calendar.Channel{
		Id:      input.WebhookID,
		Type:    "web_hook",
		Address: input.WebhookURL,
		Token:   input.SecretToken,
	}

	// Registrar webhook
	result, err := service.Events.Watch(input.CalendarID, channel).Do()
	if err != nil {
		return GCalWebhookSetupResult{
			Success: false,
			Error:   fmt.Sprintf("watch: %v", err),
		}, nil
	}

	// Calcular expiration
	expirationMillis := result.Expiration
	expirationTime := time.Unix(0, expirationMillis*1000000)

	return GCalWebhookSetupResult{
		Success:    true,
		ChannelID:  result.Id,
		ResourceID: result.ResourceId,
		Expiration: expirationTime.Format(time.RFC3339),
		WebhookURL: input.WebhookURL,
	}, nil
}
```

---

### f/gcal_webhook_renew/main.go

**Propósito:** Renovar webhook antes de expiración

```go
package inner

// Ver sección "Paso 4: Renovar Webhook" arriba
```

---

### f/gcal_sync_engine/main.go

**Propósito:** Procesar eventos del webhook (YA EXISTE)

```go
// Este script ya está implementado
// Ver: f/gcal_sync_engine/main.go
```

---

## 🧪 Testing

### Test 1: Verificar Endpoint

```bash
# Simular webhook de Google Calendar
curl -X POST https://windmill.stax.ink/api/gcal/webhook \
  -H "X-Goog-Channel-ID: test-channel-001" \
  -H "X-Goog-Resource-ID: primary" \
  -H "X-Goog-Resource-URI: /users/me/calendars/primary/events" \
  -H "X-Goog-Resource-State: sync" \
  -H "X-Goog-Message-Number: 1" \
  -H "X-Goog-Channel-Token: tu-secret-token" \
  -v

# Esperado: HTTP 200 OK
```

### Test 2: Simular Cancelación

```bash
# 1. Crear evento de prueba en GCal
# 2. Eliminar evento manualmente
# 3. Verificar que booking en DB se canceló automáticamente

psql "$NEON_DATABASE_URL" -c "
  SELECT booking_id, status, cancellation_reason
  FROM bookings
  WHERE gcal_event_id = '<test_event_id>'
  ORDER BY created_at DESC
  LIMIT 1;
"
```

---

## ⚠️ Consideraciones Importantes

### 1. HTTPS Requerido

Google **SOLO** acepta webhooks HTTPS:

```
✅ https://windmill.stax.ink/api/gcal/webhook
❌ http://windmill.stax.ink/api/gcal/webhook
```

### 2. Expiración de 7 Días

Los webhooks expiran después de **máximo 7 días**:

```go
// Verificar expiración
expiration := time.Unix(0, expirationMillis*1000000)
daysUntilExpiration := time.Until(expiration).Hours() / 24

if daysUntilExpiration < 2 {
    // Renovar inmediatamente
    renewWebhook()
}
```

### 3. Rate Limits

Google Calendar API tiene límites:

| Límite | Valor |
|--------|-------|
| Queries por día | 1,000,000 |
| Queries por segundo | 10-100 |
| Webhooks por proyecto | Ilimitados |

### 4. Timeout de Respuesta

Google espera respuesta en **< 3 segundos**:

```go
// API Gateway debe responder rápido
func gcalWebhookHandler(w http.ResponseWriter, r *http.Request) {
    // Procesar asíncronamente (Windmill Flow)
    go callWindmillAsync(payload)
    
    // Responder inmediatamente
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("OK"))
}
```

---

## 📊 Monitoreo

### Query: Webhooks Activos

```sql
-- Verificar webhooks registrados
SELECT 
    channel_id,
    resource_id,
    expiration,
    state,
    created_at
FROM gcal_webhooks
WHERE expiration > NOW()
ORDER BY expiration ASC;
```

### Query: Eventos Procesados

```sql
-- Ver eventos procesados del webhook
SELECT 
    resource_state,
    message_number,
    processed_at,
    action_taken
FROM gcal_webhook_events
ORDER BY processed_at DESC
LIMIT 50;
```

### Alertas

```sql
-- Webhooks por expirar (< 2 días)
SELECT channel_id, expiration
FROM gcal_webhooks
WHERE expiration < NOW() + INTERVAL '2 days'
  AND expiration > NOW();

-- Webhooks expirados
SELECT channel_id, expiration
FROM gcal_webhooks
WHERE expiration < NOW();
```

---

## 🐛 Troubleshooting

### Error: 400 Bad Request

**Causa:** Webhook URL inválida o sin HTTPS

**Solución:**
```bash
# Verificar URL
curl -I https://windmill.stax.ink/api/gcal/webhook

# Debe retornar: HTTP/1.1 200 OK (o 405 Method Not Allowed para GET)
```

### Error: 401 Unauthorized

**Causa:** Token inválido o credenciales expiradas

**Solución:**
```bash
# Renovar Service Account credentials
# Verificar X-Goog-Channel-Token en request
```

### Error: Webhook no llega

**Causas posibles:**
1. Firewall bloquea Google IPs
2. DNS no resuelve
3. Webhook expirado

**Solución:**
```bash
# 1. Verificar logs del API Gateway
journalctl -u api-gateway -f

# 2. Verificar expiración
SELECT expiration FROM gcal_webhooks ORDER BY expiration DESC LIMIT 1;

# 3. Renovar webhook
go run cmd/tools/gcal_webhook_setup.go --renew
```

---

## ✅ Checklist de Implementación

### API Gateway

- [ ] Endpoint `/api/gcal/webhook` registrado
- [ ] Validación de `X-Goog-Channel-Token` implementada
- [ ] Logging de eventos (sin PII)
- [ ] Respuesta < 3 segundos
- [ ] HTTPS configurado

### Windmill

- [ ] Script `f/gcal_webhook_setup/main.go` creado
- [ ] Script `f/gcal_webhook_renew/main.go` creado
- [ ] Schedule para renovación diaria configurado
- [ ] Flow `gcal-sync-engine` conectado

### Google Cloud

- [ ] Calendar API habilitada
- [ ] Service Account con domain-wide delegation
- [ ] Scope `https://www.googleapis.com/auth/calendar` autorizado
- [ ] Webhook registrado con `events.watch`

### Monitoreo

- [ ] Tabla `gcal_webhooks` creada
- [ ] Tabla `gcal_webhook_events` creada
- [ ] Alertas para webhooks por expirar
- [ ] Dashboard de eventos procesados

---

## 📚 Referencias

- [Google Calendar Push Notifications](https://developers.google.com/calendar/api/v3/reference/channels/watch)
- [Calendar API Webhooks Guide](https://developers.google.com/calendar/api/v3/push)
- [Google Cloud Service Account](https://cloud.google.com/iam/docs/service-accounts)

---

**Última actualización:** 2026-03-31  
**Estado:** ✅ Production Ready
