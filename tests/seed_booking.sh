#!/bin/bash
# Seed Booking Script - Crea reserva en DB + sincroniza con GCal
# Uso: ./tests/seed_booking.sh [hour]
# Ejemplo: ./tests/seed_booking.sh 10

set -e

# Configuración
DATE="${DATE:-$(date -d 'tomorrow' +%Y-%m-%d)}"
HOUR="${1:-10}"
PROVIDER_ID="00000000-0000-0000-0000-000000000001"
SERVICE_ID="00000000-0000-0000-0000-000000000001"
CHAT_ID="5391760292"
TZ_OFFSET="-03:00"
CALENDAR_ID="${GCAL_CALENDAR_ID:-primary}"

echo "═══════════════════════════════════════════════════════════"
echo "  SEED BOOKING - DB + GCAL SYNC"
echo "═══════════════════════════════════════════════════════════"
echo "📅 Date: $DATE"
echo "🕐 Time: $(printf '%02d' $HOUR):00 $TZ_OFFSET"
echo "👨‍⚕️ Provider: $PROVIDER_ID"
echo "🏥 Service: $SERVICE_ID"
echo "👤 Chat ID: $CHAT_ID"
echo "📅 Calendar: $CALENDAR_ID"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Generar idempotency key
IDEMPOTENCY_KEY="SEED-${DATE}-P${PROVIDER_ID}-S${SERVICE_ID}-$(printf '%02d' $HOUR)00"

# Calcular tiempos
START_TIME="${DATE}T$(printf '%02d' $HOUR):00:00${TZ_OFFSET}"
END_TIME="${DATE}T$(printf '%02d' $((HOUR + 1))):00:00${TZ_OFFSET}"

echo "📝 Paso 1: Creando en DB..."
DB_OUTPUT=$(psql "$NEON_DATABASE_URL" -t -A -c "
INSERT INTO bookings (provider_id, service_id, start_time, end_time, status, idempotency_key, user_id)
VALUES ('$PROVIDER_ID', '$SERVICE_ID', '$START_TIME', '$END_TIME', 'confirmed', '$IDEMPOTENCY_KEY', $CHAT_ID)
ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
RETURNING id, status;
" 2>&1)

if [[ $? -ne 0 ]]; then
    echo "❌ DB Error: $DB_OUTPUT"
    exit 1
fi

BOOKING_ID=$(echo "$DB_OUTPUT" | cut -d'|' -f1)
STATUS=$(echo "$DB_OUTPUT" | cut -d'|' -f2)

echo "✅ DB Booking ID: $BOOKING_ID"
echo "✅ Status: $STATUS"
echo ""

echo "📅 Paso 2: Sincronizando con Google Calendar..."

# Crear evento con Go
GCAL_OUTPUT=$(./bin/gcal_create "$BOOKING_ID" "$START_TIME" "$END_TIME" "$CALENDAR_ID" 2>&1)
GCAL_EXIT=$?

echo "$GCAL_OUTPUT" | grep -E "^✅|^❌"

if [[ $GCAL_EXIT -ne 0 ]]; then
    echo "⚠️  GCal sync failed (booking exists in DB)"
    exit 1
fi

GCAL_EVENT_ID=$(echo "$GCAL_OUTPUT" | grep "GCAL_EVENT_ID=" | cut -d'=' -f2)

echo ""
echo "📝 Paso 3: Actualizando DB con GCal event ID..."
psql "$NEON_DATABASE_URL" -c "UPDATE bookings SET gcal_event_id = '$GCAL_EVENT_ID', gcal_synced_at = NOW() WHERE id = '$BOOKING_ID';" > /dev/null 2>&1
echo "✅ DB actualizada"
echo ""
echo "✅ SEED BOOKING COMPLETADO!"
echo "═══════════════════════════════════════════════════════════"
echo "DB ID: $BOOKING_ID"
echo "GCal Event ID: $GCAL_EVENT_ID"
echo "═══════════════════════════════════════════════════════════"
