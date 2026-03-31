# Google Calendar Webhook - Quick Reference

## ¿Qué hace este sistema?

Cuando un usuario **elimina o edita un evento** en Google Calendar, el sistema **automáticamente actualiza la base de datos** para cancelar o modificar el booking correspondiente.

---

## Setup Rápido

### 1. Configurar Webhook Inicial

```bash
cd /home/manager/Sync/wildmill-proyects/booking-titanium-wm

go run cmd/tools/gcal_webhook_setup.go \
  --calendar-id primary \
  --webhook-url https://windmill.stax.ink/api/gcal/webhook \
  --webhook-id booking-titanium-001 \
  --token "tu-secret-token-123" \
  --credentials-path ~/.secrets_wm/booking-sa-key.json
```

### 2. Configurar Renovación Diaria (Cron)

En Windmill UI:
- **Path:** `f/schedules/gcal-webhook-renew`
- **Cron:** `0 0 * * *` (diario a medianoche)
- **Script:** `f/gcal_webhook_renew/main.go`

### 3. Variables de Entorno

```bash
# API Gateway
export GCAL_WEBHOOK_TOKEN="tu-secret-token-123"
```

---

## Testing

### Probar Endpoint

```bash
curl -X POST https://windmill.stax.ink/api/gcal/webhook \
  -H "X-Goog-Channel-ID: booking-test-001" \
  -H "X-Goog-Channel-Token: tu-secret-token-123" \
  -H "X-Goog-Resource-State: sync" \
  -v
```

**Respuesta esperada:** `HTTP 200 OK`, body: `OK`

### Probar Cancelación Automática

1. Crear booking de prueba
2. Eliminar evento desde Google Calendar
3. Verificar en DB:

```bash
psql "$NEON_DATABASE_URL" -c "
  SELECT booking_id, status, cancellation_reason
  FROM bookings
  WHERE gcal_event_id = '<test_event_id>'
  ORDER BY created_at DESC
  LIMIT 1;
"
```

**Resultado esperado:** `status = 'CANCELLED'`

---

## Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `cmd/api/main.go` | Handler del webhook (`gcalWebhookHandler`) |
| `f/gcal_sync_engine/main.go` | Procesa eventos del webhook (actualiza DB) |
| `f/gcal_webhook_setup/main.go` | Registra webhook con Google |
| `f/gcal_webhook_renew/main.go` | Renueva webhook antes de expiración |
| `docs/GCAL_WEBHOOK_SETUP.md` | Documentación completa |

---

## ⚠️ Importante

### Expiración de 7 Días

Los webhooks de Google Calendar expiran después de **máximo 7 días**.

**Solución:** El cron job diario (`0 0 * * *`) renueva automáticamente el webhook.

### HTTPS Requerido

Google **SOLO** acepta webhooks HTTPS:

```
✅ https://windmill.stax.ink/api/gcal/webhook
❌ http://windmill.stax.ink/api/gcal/webhook
```

### Respuesta < 3 Segundos

Google espera respuesta rápida. El API Gateway responde inmediatamente y procesa asíncronamente.

---

## Flujo Completo

```
Usuario elimina evento en GCal
         ↓
GCal notifica al webhook (POST)
         ↓
API Gateway valida token
         ↓
Responde 200 OK (rápido)
         ↓
Procesa asíncronamente (goroutine)
         ↓
Windmill: gcal_sync_engine
         ↓
DB: UPDATE bookings SET status = 'CANCELLED'
         ↓
✅ Booking cancelado automáticamente
```

---

## Monitoreo

### Verificar Webhooks Activos

```sql
SELECT channel_id, expiration, created_at
FROM gcal_webhooks
WHERE expiration > NOW()
ORDER BY expiration ASC;
```

### Eventos Procesados

```sql
SELECT resource_state, COUNT(*) as count
FROM gcal_webhook_events
WHERE processed_at >= NOW() - INTERVAL '24 hours'
GROUP BY resource_state;
```

---

## Troubleshooting

### Webhook no llega

1. Verificar HTTPS: `curl -I https://windmill.stax.ink/api/gcal/webhook`
2. Verificar expiración: `SELECT expiration FROM gcal_webhooks ORDER BY expiration DESC LIMIT 1;`
3. Renovar: `go run cmd/tools/gcal_webhook_setup.go --renew ...`

### Error 401 Unauthorized

Token inválido. Verificar:
```bash
echo $GCAL_WEBHOOK_TOKEN
# Debe coincidir con el token configurado en Google
```

---

## Referencias

- `docs/GCAL_WEBHOOK_SETUP.md` - Documentación completa
- `docs/GCAL_WEBHOOK_IMPLEMENTATION_SUMMARY.md` - Resumen de implementación
- [Google Calendar Push Notifications](https://developers.google.com/calendar/api/v3/push)

---

**Última actualización:** 2026-03-31  
**Estado:** ✅ Production Ready
