#!/bin/bash

# Script de migración de tests desde n8n a Windmill
# Uso: ./migrate-tests.sh

set -e

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Paths
ORIGEN="../../tests"
DESTINO="./unit"
DESTINO_INTEGRATION="./integration"
DESTINO_E2E="./e2e"

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verificar que existan los tests originales
if [ ! -d "$ORIGEN" ]; then
    print_error "No se encontró el directorio de tests originales: $ORIGEN"
    exit 1
fi

print_info "Iniciando migración de tests..."
print_info "Origen: $ORIGEN"
print_info "Destino: $DESTINO"

# Contador
MIGRADOS=0
FALLIDOS=0

# Migrar tests unitarios
print_info "Migrando tests unitarios..."

UNIT_TESTS=(
    "BB_00_Config.test.ts"
    "CB_01_Check_State.test.ts"
    "CB_02_Record_Result.test.ts"
    "DB_Cancel_Booking.test.ts"
    "DB_Create_Booking.test.ts"
    "DB_Find_Next_Available.test.ts"
    "DB_Get_Availability.test.ts"
    "DB_Get_Providers.test.ts"
    "DB_Get_Providers_By_Service.test.ts"
    "DB_Get_Services.test.ts"
    "DB_Reschedule_Booking.test.ts"
    "DLQ_01_Add_Entry.test.ts"
    "DLQ_02_Get_Status.test.ts"
    "GCAL_Delete_Event.test.ts"
    "GMAIL_Send_Confirmation.test.ts"
    "NN_04_Telegram_Sender.test.ts"
    "NN_05_Reminder_Cron.test.ts"
)

for test in "${UNIT_TESTS[@]}"; do
    if [ -f "$ORIGEN/$test" ]; then
        print_info "Migrando $test..."
        cp "$ORIGEN/$test" "$DESTINO/"
        
        # Reemplazar URLs de n8n por Windmill
        sed -i 's/N8N_URL/WINDMILL_API_URL/g' "$DESTINO/$test"
        sed -i 's|https://n8n.stax.ink|http://localhost:8080|g' "$DESTINO/$test"
        sed -i 's|/webhook/|/book-appointment|g' "$DESTINO/$test"
        
        # Actualizar action en payloads
        sed -i 's/action:.*$/action: "execute"/g' "$DESTINO/$test" 2>/dev/null || true
        
        MIGRADOS=$((MIGRADOS + 1))
        echo -e "${GREEN}✓${NC} $test migrado"
    else
        print_warning "$test no encontrado en origen"
        FALLIDOS=$((FALLIDOS + 1))
    fi
done

# Migrar tests de integración
print_info "Migrando tests de integración..."

INTEGRATION_TESTS=(
    "WF2_Booking_Orchestrator_Orchestration.test.ts"
    "WF2_Orchestrator.test.ts"
    "WF6_Rollback_Workflow.test.ts"
    "WF7_Distributed_Lock_System.test.ts"
    "RAG_02_Document_Retrieval.test.ts"
    "SEED_01_Daily_Provisioning.test.ts"
)

for test in "${INTEGRATION_TESTS[@]}"; do
    if [ -f "$ORIGEN/$test" ]; then
        print_info "Migrando $test..."
        cp "$ORIGEN/$test" "$DESTINO_INTEGRATION/"
        
        # Reemplazar URLs
        sed -i 's/N8N_URL/WINDMILL_API_URL/g' "$DESTINO_INTEGRATION/$test"
        sed -i 's|https://n8n.stax.ink|http://localhost:8080|g' "$DESTINO_INTEGRATION/$test"
        
        MIGRADOS=$((MIGRADOS + 1))
        echo -e "${GREEN}✓${NC} $test migrado"
    else
        print_warning "$test no encontrado en origen"
        FALLIDOS=$((FALLIDOS + 1))
    fi
done

# Migrar tests E2E
print_info "Migrando tests E2E..."

E2E_TESTS=(
    "WF1_Booking_API_Gateway.test.ts"
    "rag_integration.test.ts"
)

for test in "${E2E_TESTS[@]}"; do
    if [ -f "$ORIGEN/$test" ]; then
        print_info "Migrando $test..."
        cp "$ORIGEN/$test" "$DESTINO_E2E/"
        
        # Reemplazar URLs
        sed -i 's/N8N_URL/WINDMILL_API_URL/g' "$DESTINO_E2E/$test"
        sed -i 's|https://n8n.stax.ink|http://localhost:8080|g' "$DESTINO_E2E/$test"
        
        MIGRADOS=$((MIGRADOS + 1))
        echo -e "${GREEN}✓${NC} $test migrado"
    else
        print_warning "$test no encontrado en origen"
        FALLIDOS=$((FALLIDOS + 1))
    fi
done

# Resumen
echo ""
print_info "================================"
print_info "Migración completada"
print_info "================================"
echo -e "${GREEN}Migrados:${NC} $MIGRADOS"
echo -e "${RED}Fallidos:${NC} $FALLIDOS"
echo ""

if [ $FALLIDOS -gt 0 ]; then
    print_warning "Algunos tests no se pudieron migrar"
    exit 1
else
    print_info "¡Todos los tests se migraron exitosamente!"
    exit 0
fi
