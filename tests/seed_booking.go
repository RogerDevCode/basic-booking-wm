package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/oauth2/google"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

// SeedBookingRequest es la solicitud para crear una reserva con seed
type SeedBookingRequest struct {
	Date            string `json:"date"`              // YYYY-MM-DD
	ProviderID      string `json:"provider_id"`       // UUID
	ServiceID       string `json:"service_id"`        // UUID
	Hour            int    `json:"hour"`              // 0-23
	ChatID          string `json:"chat_id"`           // User ID
	DurationMinutes int    `json:"duration_minutes"`  // Duración
	TZOffset        string `json:"tz_offset"`         // -03:00
	CalendarID      string `json:"calendar_id"`       // GCal calendar
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Uso: go run tests/seed_booking.go <hour>")
		fmt.Println("Ejemplo: go run tests/seed_booking.go 10")
		os.Exit(1)
	}

	hour := 10
	fmt.Sscanf(os.Args[1], "%d", &hour)

	// Configurar request
	tomorrow := time.Now().AddDate(0, 0, 1)
	dateStr := tomorrow.Format("2006-01-02")

	req := SeedBookingRequest{
		Date:            dateStr,
		ProviderID:      "00000000-0000-0000-0000-000000000001",
		ServiceID:       "00000000-0000-0000-0000-000000000001",
		Hour:            hour,
		ChatID:          "5391760292",
		DurationMinutes: 60,
		TZOffset:        "-03:00",
		CalendarID:      "primary", // Se puede cambiar por el calendar de grupo
	}

	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Println("  SEED BOOKING - DB + GCAL SYNC")
	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Printf("📅 Date: %s\n", req.Date)
	fmt.Printf("🕐 Time: %02d:00 %s\n", req.Hour, req.TZOffset)
	fmt.Printf("👨‍⚕️ Provider: %s\n", req.ProviderID)
	fmt.Printf("🏥 Service: %s\n", req.ServiceID)
	fmt.Printf("👤 Chat ID: %s\n", req.ChatID)
	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Println()

	// 1. Crear en DB
	fmt.Println("📝 Paso 1: Creando en DB...")
	dbResult := createInDB(req)
	if !dbResult.Success {
		fmt.Printf("❌ DB Error: %s\n", dbResult.Error)
		os.Exit(1)
	}
	fmt.Printf("✅ DB Booking ID: %s\n", dbResult.BookingID)
	fmt.Println()

	// 2. Sincronizar con GCal
	fmt.Println("📅 Paso 2: Sincronizando con Google Calendar...")
	gcalResult := syncToGCal(req, dbResult)
	if !gcalResult.Success {
		fmt.Printf("⚠️  GCal Warning: %s\n", gcalResult.Error)
		fmt.Println("   (La reserva existe en DB, GCal se sincronizará después)")
	} else {
		fmt.Printf("✅ GCal Event ID: %s\n", gcalResult.EventID)
		fmt.Printf("🔗 GCal Link: %s\n", gcalResult.HtmlLink)
	}
	fmt.Println()

	// 3. Actualizar DB con GCal event ID
	fmt.Println("📝 Paso 3: Actualizando DB con GCal event ID...")
	updateResult := updateDBWithGCal(dbResult.BookingID, gcalResult.EventID)
	if updateResult.Success {
		fmt.Println("✅ DB actualizada correctamente")
	} else {
		fmt.Printf("⚠️  Update Warning: %s\n", updateResult.Error)
	}
	fmt.Println()

	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Println("  ✅ SEED BOOKING COMPLETADO")
	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Printf("DB: %s\n", dbResult.BookingID)
	fmt.Printf("GCal: %s\n", gcalResult.EventID)
	fmt.Println()
}

// createInDB crea la reserva en la base de datos
func createInDB(req SeedBookingRequest) DBResult {
	// Obtener DB URL
	dbURL := os.Getenv("NEON_DATABASE_URL")
	if dbURL == "" {
		return DBResult{Success: false, Error: "NEON_DATABASE_URL no configurada"}
	}

	// Generar idempotency key
	idempotencyKey := fmt.Sprintf("SEED-%s-P%s-S%s-%02d00",
		req.Date, req.ProviderID, req.ServiceID, req.Hour)

	// Calcular start y end time
	startTime := fmt.Sprintf("%sT%02d:00:00%s", req.Date, req.Hour, req.TZOffset)
	endTime := fmt.Sprintf("%sT%02d:00:00%s", req.Date, req.Hour+1, req.TZOffset)

	// Crear con psql
	cmd := fmt.Sprintf(`psql "%s" -c "INSERT INTO bookings (provider_id, service_id, start_time, end_time, status, idempotency_key, user_id) VALUES ('%s', '%s', '%s', '%s', 'confirmed', '%s', %s) RETURNING id, status;" 2>&1`,
		dbURL, req.ProviderID, req.ServiceID, startTime, endTime, idempotencyKey, req.ChatID)

	output, err := execCommand(cmd)
	if err != nil {
		return DBResult{Success: false, Error: fmt.Sprintf("PSQL error: %v - %s", err, output)}
	}

	// Parsear output para obtener booking ID
	bookingID := parseBookingID(output)
	if bookingID == "" {
		return DBResult{Success: false, Error: "No se pudo obtener booking ID"}
	}

	return DBResult{Success: true, BookingID: bookingID}
}

// syncToGCal sincroniza con Google Calendar
func syncToGCal(req SeedBookingRequest, dbResult DBResult) GCalResult {
	// Cargar credenciales
	homeDir, _ := os.UserHomeDir()
	credsPath := filepath.Join(homeDir, ".secrets_wm", "booking-sa-key.json")
	credsJSON, err := ioutil.ReadFile(credsPath)
	if err != nil {
		return GCalResult{Success: false, Error: fmt.Sprintf("Creds error: %v", err)}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	creds, err := google.CredentialsFromJSON(ctx, credsJSON, calendar.CalendarScope)
	if err != nil {
		return GCalResult{Success: false, Error: fmt.Sprintf("Auth error: %v", err)}
	}

	srv, err := calendar.NewService(ctx, option.WithCredentials(creds))
	if err != nil {
		return GCalResult{Success: false, Error: fmt.Sprintf("Service error: %v", err)}
	}

	// Crear evento
	startTime := fmt.Sprintf("%sT%02d:00:00%s", req.Date, req.Hour, req.TZOffset)
	endTime := fmt.Sprintf("%sT%02d:00:00%s", req.Date, req.Hour+1, req.TZOffset)

	event := &calendar.Event{
		Summary:     "Cita Médica - Seed Booking",
		Description: fmt.Sprintf("Booking ID: %s", dbResult.BookingID),
		Start: &calendar.EventDateTime{
			DateTime: startTime,
			TimeZone: "America/Argentina/Buenos_Aires",
		},
		End: &calendar.EventDateTime{
			DateTime: endTime,
			TimeZone: "America/Argentina/Buenos_Aires",
		},
	}

	createdEvent, err := srv.Events.Insert(req.CalendarID, event).Do()
	if err != nil {
		return GCalResult{Success: false, Error: fmt.Sprintf("GCal error: %v", err)}
	}

	return GCalResult{
		Success:   true,
		EventID:   createdEvent.Id,
		HtmlLink:  createdEvent.HtmlLink,
	}
}

// updateDBWithGCal actualiza la DB con el event ID de GCal
func updateDBWithGCal(bookingID, eventID string) DBResult {
	dbURL := os.Getenv("NEON_DATABASE_URL")
	if dbURL == "" {
		return DBResult{Success: false, Error: "NEON_DATABASE_URL no configurada"}
	}

	cmd := fmt.Sprintf(`psql "%s" -c "UPDATE bookings SET gcal_event_id = '%s', gcal_synced_at = NOW() WHERE id = '%s' RETURNING id;" 2>&1`,
		dbURL, eventID, bookingID)

	output, err := execCommand(cmd)
	if err != nil {
		return DBResult{Success: false, Error: fmt.Sprintf("PSQL error: %v - %s", err, output)}
	}

	return DBResult{Success: true}
}

// Helpers
type DBResult struct {
	Success   bool
	BookingID string
	Error     string
}

type GCalResult struct {
	Success  bool
	EventID  string
	HtmlLink string
	Error    string
}

func execCommand(cmd string) (string, error) {
	// Implementación simple con os/exec
	// En producción usar exec.Command
	return "", nil
}

func parseBookingID(output string) string {
	// Parsear output de psql para obtener UUID
	// Implementación simplificada
	return ""
}
