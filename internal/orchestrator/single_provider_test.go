package orchestrator

import (
	"fmt"
	"testing"
	"time"

	"booking-titanium-wm/internal/core/db"
)

// TestSingleProviderIntegrity verifica que el proveedor y servicio únicos existan en la DB
func TestSingleProviderIntegrity(t *testing.T) {
	// 1. Verificar Proveedor Único
	var providerID string
	err := db.GetDB().QueryRow("SELECT id FROM providers WHERE id = '00000000-0000-0000-0000-000000000001'").Scan(&providerID)
	if err != nil {
		t.Fatalf("Single provider not found in database: %v", err)
	}

	// 2. Verificar Servicio Único
	var serviceID string
	err = db.GetDB().QueryRow("SELECT id FROM services WHERE id = '00000000-0000-0000-0000-000000000001'").Scan(&serviceID)
	if err != nil {
		t.Fatalf("Single service not found in database: %v", err)
	}
}

// TestBookingOrchestrator_SingleProvider verifica el flujo completo con IDs inyectados
func TestBookingOrchestrator_SingleProvider(t *testing.T) {
	now := time.Now().UTC()
	// ChatID numérico como bigint
	chatID := now.Unix()
	chatIDStr := fmt.Sprintf("%d", chatID)
	
	// Pre-requisito: Insertar usuario para satisfacer FK (usando nombres de columna reales)
	_, err := db.GetDB().Exec("INSERT INTO users (chat_id, full_name) VALUES ($1, $2) ON CONFLICT DO NOTHING", chatID, "Test User")
	if err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}

	// Generar una fecha limpia (ej. dentro de 2 días a las 10:00 AM UTC)
	testDate := time.Date(now.Year(), now.Month(), now.Day(), 10, 0, 0, 0, time.UTC).AddDate(0, 0, 2)
	cleanStartTime := testDate.Format(time.RFC3339)

	// Datos de prueba
	req := BookingOrchestratorRequest{
		StartTime: cleanStartTime,
		ChatID:    chatIDStr,
		UserName:  "Test User",
		UserEmail: "test@example.com",
	}

	// Ejecutar orquestador
	response := BookingOrchestrator(req)

	// Validar éxito
	if !response.Success {
		t.Errorf("Booking failed: %v", *response.ErrorMessage)
	}

	// Verificar inserción en DB
	var count int
	db.GetDB().QueryRow("SELECT COUNT(*) FROM bookings WHERE user_id = $1", chatIDStr).Scan(&count)
	if count == 0 {
		t.Error("Booking record was not created in database")
	}
}

// TestIdempotency_SingleProvider verifica que no haya duplicados bajo el nuevo esquema
func TestIdempotency_SingleProvider(t *testing.T) {
	now := time.Now().UTC()
	chatID := now.Unix() + 1000
	chatIDStr := fmt.Sprintf("%d", chatID)
	
	// Pre-requisito: Insertar usuario
	_, err := db.GetDB().Exec("INSERT INTO users (chat_id, full_name) VALUES ($1, $2) ON CONFLICT DO NOTHING", chatID, "Idempotent User")
	if err != nil {
		t.Fatalf("Failed to create idempotent test user: %v", err)
	}

	testDate := time.Date(now.Year(), now.Month(), now.Day(), 14, 0, 0, 0, time.UTC).AddDate(0, 0, 3)
	cleanStartTime := testDate.Format(time.RFC3339)
	
	req := BookingOrchestratorRequest{
		StartTime: cleanStartTime,
		ChatID:    chatIDStr,
		UserName:  "Idempotent User",
	}

	// Primer intento: Éxito
	res1 := BookingOrchestrator(req)
	if !res1.Success {
		t.Fatalf("First booking attempt failed: %v", *res1.ErrorMessage)
	}

	// Segundo intento: Debe ser detectado
	BookingOrchestrator(req)
	
	// Verificamos que no cree un segundo registro
	var count int
	db.GetDB().QueryRow("SELECT COUNT(*) FROM bookings WHERE user_id = $1 AND start_time = $2", chatIDStr, cleanStartTime).Scan(&count)
	
	if count > 1 {
		t.Errorf("Idempotency failed: %d duplicate bookings created", count)
	}
}
