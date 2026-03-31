# Google Calendar Webhook Implementation Summary

**Fecha:** 2026-03-31  
**Estado:** ✅ Implementado y Compilado  
**Versión:** 1.0.0

---

## 🎯 ¿Qué se Implementó?

El sistema **AHORA PUEDE** recibir notificaciones automáticas de Google Calendar cuando:
- Un usuario **elimina** un evento desde su calendario
- Un usuario **edita** un evento (cambia hora, título, etc.)
- Un evento es **cancelado** por cualquier razón

---

## 📁 Archivos Creados/Modificados

### Nuevos Archivos (4)

| Archivo | Propósito | Estado |
|---------|-----------|--------|
| `docs/GCAL_WEBHOOK_SETUP.md` | Documentación completa del setup | ✅ Creado |
| `f/gcal_webhook_setup/main.go` | Script Windmill para registrar webhook | ✅ Creado |
| `f/gcal_webhook_renew/main.go` | Script Windmill para renovar webhook (diario) | ✅ Creado |
| `cmd/tools/gcal_webhook_setup.go` | CLI tool para setup inicial | ✅ Compilado |

### Archivos Modificados (1)

| Archivo | Cambio | Estado |
|---------|--------|--------|
| `cmd/api/main.go` | Agregado handler `/api/gcal/webhook` | ✅ Modificado |

---

## 🏗️ Arquitectura

### Flujo Completo

```
┌─────────────────────────────────────────────────────────────────┐
│  GOOGLE CALENDAR WEBHOOK FLOW                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Usuario elimina evento en Google Calendar 📱                │
│                                                                 │
│  2. GCal detecta cambio → notifica a tu webhook                 │
│     POST https://windmill.stax.ink/api/gcal/webhook             │
│     Headers: X-Goog-Channel-ID, X-Goog-Resource-State, etc.     │
│                                                                 │
│  3. API Gateway valida y procesa (rápido, <3 seg)               │
│     - Verificar X-Goog-Channel-Token (seguridad)                │
│     - Extraer event_id del channel                              │
│     - Responder 200 OK a Google                                 │
│     - Procesar asíncronamente (goroutine)                       │
│                                                                 │
│  4. Windmill Flow actualiza DB                                  │
│     Script: f/gcal_sync_engine/main.go                          │
│     - UPDATE bookings SET status = 'CANCELLED'                  │
│     - INSERT booking_audit (audit trail)                        │
│                                                                 │
│  5. ✅ DB actualizada automáticamente                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Configuración

### Paso 1: Configurar Webhook Inicial

```bash
# Ejecutar herramienta de setup
cd /home/manager/Sync/wildmill-proyects/booking-titanium-wm

go run cmd/tools/gcal_webhook_setup.go \
  --calendar-id primary \
  --webhook-url https://windmill.stax.ink/api/gcal/webhook \
  --webhook-id booking-titanium-001 \
  --token <secret-token-123> \
  --credentials-path ~/.secrets_wm/booking-sa-key.json
```

### Paso 2: Configurar Renovación Automática (Cron)

Los webhooks de GCal expiran después de **7 días máximo**.

**Windmill Schedule:**
```yaml
# Path: f/schedules/gcal-webhook-renew
# Cron: 0 0 * * * (diario a medianoche)
# Script: f/gcal_webhook_renew/main.go
```

### Paso 3: Variables de Entorno

```bash
# API Gateway
export GCAL_WEBHOOK_TOKEN="secret-token-123"

# Windmill (para los scripts)
# Crear variables en Windmill UI:
# - f/variables/gcal-webhook-token
# - f/variables/gcal-webhook-url
# - f/variables/gcal-webhook-id
```

---

## 🧪 Testing

### Test 1: Verificar Endpoint

```bash
# Simular webhook de Google Calendar
curl -X POST https://windmill.stax.ink/api/gcal/webhook \
  -H "X-Goog-Channel-ID: booking-test-001" \
  -H "X-Goog-Resource-ID: primary" \
  -H "X-Goog-Resource-State: sync" \
  -H "X-Goog-Channel-Token: secret-token-123" \
  -v

# Esperado: HTTP 200 OK, body: "OK"
```

### Test 2: Simular Cancelación

```bash
# 1. Crear booking de prueba
# 2. Eliminar evento de GCal manualmente
# 3. Verificar en DB

psql "$NEON_DATABASE_URL" -c "
  SELECT booking_id, status, cancellation_reason
  FROM bookings
  WHERE gcal_event_id = '<test_event_id>'
  ORDER BY created_at DESC
  LIMIT 1;
"

# Esperado: status = 'CANCELLED', cancellation_reason = 'GCal Event Deleted'
```

---

## 🔐 Seguridad

### Validación de Token

El API Gateway verifica el `X-Goog-Channel-Token`:

```go
token := r.Header.Get("X-Goog-Channel-Token")
expectedToken := os.Getenv("GCAL_WEBHOOK_TOKEN")
if token != expectedToken {
    http.Error(w, "Unauthorized", http.StatusUnauthorized)
    return
}
```

### HTTPS Requerido

Google **SOLO** acepta webhooks HTTPS:

```
✅ https://windmill.stax.ink/api/gcal/webhook
❌ http://windmill.stax.ink/api/gcal/webhook
```

---

## 📊 Estados del Webhook

Google Calendar envía diferentes estados:

| X-Goog-Resource-State | Significado | Acción del Sistema |
|-----------------------|-------------|-------------------|
| **sync** | Webhook verificado/recién creado | Solo logging, responder OK |
| **exists** | Recurso existe (sin cambios) | Ignorar silenciosamente |
| **update** | Hubo cambio en el calendario | Procesar: fetch evento → actualizar DB |

---

## ⚠️ Consideraciones Importantes

### 1. Expiración de 7 Días

Los webhooks expiran después de **máximo 7 días**:

```bash
# Verificar expiración
# El script de setup muestra: "Expires in X.X days"

# Si < 2 días → renovar inmediatamente
go run cmd/tools/gcal_webhook_setup.go --renew ...
```

### 2. Respuesta Rápida (< 3 segundos)

Google espera respuesta rápida:

```go
// API Gateway responde inmediatamente
w.WriteHeader(http.StatusOK)
w.Write([]byte("OK"))

// Procesamiento se hace asíncronamente (goroutine)
go processGCalWebhookEvent(eventID, resourceState)
```

### 3. Idempotencia

El sistema debe manejar notificaciones duplicadas:

```go
// Usar X-Goog-Message-Number para detectar duplicados
messageNumber := r.Header.Get("X-Goog-Message-Number")

// Check en Redis si ya se procesó
if alreadyProcessed(messageNumber) {
    return // Ignorar duplicado
}
```

---

## 🎯 Beneficios

### Antes (Sin Webhook)

```
1. Usuario elimina evento de GCal
2. DB no se entera
3. Booking sigue "CONFIRMED" en el sistema
4. Provider espera al paciente, paciente no llega
5. Confusión, mala experiencia
```

### Después (Con Webhook)

```
1. Usuario elimina evento de GCal
2. GCal notifica al webhook inmediatamente
3. DB se actualiza automáticamente (status = 'CANCELLED')
4. Provider ve que la cita fue cancelada
5. Sistema coherente, buena experiencia
```

---

## 📈 Monitoreo

### Queries de Monitoreo

```sql
-- Webhooks por expirar (< 2 días)
SELECT channel_id, expiration
FROM gcal_webhooks
WHERE expiration < NOW() + INTERVAL '2 days'
  AND expiration > NOW();

-- Eventos procesados hoy
SELECT 
    resource_state,
    COUNT(*) as processed_count
FROM gcal_webhook_events
WHERE processed_at >= NOW() - INTERVAL '24 hours'
GROUP BY resource_state;
```

### Alertas

Configurar alertas para:
- Webhooks por expirar (< 2 días)
- Webhooks expirados (expiration < NOW())
- Fallos de procesamiento (error rate > 5%)

---

## ✅ Checklist de Implementación

### API Gateway

- [x] ✅ Endpoint `/api/gcal/webhook` registrado
- [x] ✅ Validación de `X-Goog-Channel-Token` implementada
- [x] ✅ Logging de eventos (sin PII)
- [x] ✅ Respuesta < 3 segundos
- [x] ✅ Procesamiento asíncrono (goroutine)
- [ ] ⏳ HTTPS configurado (depende de Cloudflare)

### Windmill

- [x] ✅ Script `f/gcal_webhook_setup/main.go` creado
- [x] ✅ Script `f/gcal_webhook_renew/main.go` creado
- [x] ✅ Script `f/gcal_sync_engine/main.go` ya existe
- [ ] ⏳ Schedule para renovación diaria configurado

### Google Cloud

- [ ] ⏳ Calendar API habilitada
- [ ] ⏳ Service Account con domain-wide delegation
- [ ] ⏳ Scope `calendar` autorizado
- [ ] ⏳ Webhook registrado con `events.watch`

### Documentación

- [x] ✅ `docs/GCAL_WEBHOOK_SETUP.md` creada
- [x] ✅ Este resumen ejecutivo creado

---

## 🚀 Próximos Pasos

### Inmediatos (Esta Semana)

1. **Configurar HTTPS** en el API Gateway
   - Cloudflare Tunnel ya está configurado
   - Verificar que `/api/gcal/webhook` sea accesible

2. **Registrar Webhook en Google**
   ```bash
   go run cmd/tools/gcal_webhook_setup.go ...
   ```

3. **Configurar Schedule de Renovación**
   - Crear en Windmill UI: f/schedules/gcal-webhook-renew
   - Cron: `0 0 * * *`

4. **Test End-to-End**
   - Crear booking
   - Eliminar de GCal
   - Verificar cancelación en DB

### Corto Plazo (Próximas 2 Semanas)

1. **Dashboard de Monitoreo**
   - Webhooks activos
   - Eventos procesados
   - Tasa de error

2. **Alertas**
   - Webhooks por expirar
   - Fallos de procesamiento

3. **Documentación para Usuarios**
   - Cómo cancelar citas desde GCal
   - Qué pasa cuando cancelan

---

## 📚 Referencias

- [Google Calendar Push Notifications](https://developers.google.com/calendar/api/v3/reference/channels/watch)
- [Calendar API Webhooks Guide](https://developers.google.com/calendar/api/v3/push)
- `docs/GCAL_WEBHOOK_SETUP.md` (documentación completa)

---

**Estado:** ✅ **IMPLEMENTADO Y COMPILADO**  
**Listo para:** Configuración y Testing  
**Responsable:** Windmill Medical Booking Architect  
**Fecha:** 2026-03-31
