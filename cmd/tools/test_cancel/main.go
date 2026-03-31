package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"

	"booking-titanium-wm/internal/booking"
	"booking-titanium-wm/internal/core/config"
	"booking-titanium-wm/internal/core/db"
)

func main() {
	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Println("║  TEST DE CANCELACIÓN: Reserva 10:00 (13:00 UTC)          ║")
	fmt.Println("╚══════════════════════════════════════════════════════════╝")

	bookingID := "00e311c8-fd5b-4739-8cc6-806a7ae5e187"
	gcalEventID := "dcdiop76qqu2jg11dk9tbbapg0"

	// 1. Initialize DB and Config
	dbConfig := db.GetDefaultConfig()
	if err := db.InitDB(dbConfig); err != nil {
		fmt.Printf("❌ Failed to connect to DB: %v\n", err)
		os.Exit(1)
	}
	defer db.CloseDB()

	if err := config.Init(); err != nil {
		fmt.Printf("❌ Failed to init config: %v\n", err)
		os.Exit(1)
	}

	// 2. Load GCal credentials
	localPath := os.Getenv("DEV_LOCAL_GCAL_KEY_PATH")
	if len(localPath) > 0 && localPath[0] == '~' {
		homeDir, _ := os.UserHomeDir()
		localPath = filepath.Join(homeDir, localPath[1:])
	}
	credsJSON, err := os.ReadFile(localPath)
	if err != nil {
		fmt.Printf("❌ Failed to read credentials: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()
	svc, err := calendar.NewService(ctx, option.WithCredentialsJSON(credsJSON))
	if err != nil {
		fmt.Printf("❌ Failed to create GCal service: %v\n", err)
		os.Exit(1)
	}

	calendarID := config.GetGCalCalendarID()
	fmt.Printf("\n── 1. ELIMINANDO EVENTO DE GCAL ────────────────────────\n")
	
	calDisplay := calendarID
	if len(calDisplay) > 30 {
		calDisplay = calDisplay[:30] + "..."
	}
	fmt.Printf("   Calendario: %s\n", calDisplay)
	fmt.Printf("   Event ID: %s\n", gcalEventID)

	err = svc.Events.Delete(calendarID, gcalEventID).Do()
	if err != nil {
		fmt.Printf("   ⚠️ GCal delete Error (maybe already deleted?): %v\n", err)
	} else {
		fmt.Printf("   ✅ Evento eliminado exitosamente de Google Calendar\n")
	}

	fmt.Printf("\n── 2. CANCELANDO EN BASE DE DATOS ──────────────────────\n")
	fmt.Printf("   Booking ID: %s\n", bookingID)

	resp := booking.CancelBooking(bookingID, "Cancelado por solicitud de test manual del usuario")

	if !resp.Success {
		errMsg := "Unknown error"
		if resp.ErrorMessage != nil {
			errMsg = *resp.ErrorMessage
		}
		fmt.Printf("   ❌ Error: %s\n", errMsg)
	} else {
		fmt.Printf("   ✅ Reserva actualizada a estado 'cancelled' en la DB\n")
	}

	fmt.Printf("\n── VERIFICACIÓN DB ─────────────────────────────────────\n")
	var status, gcalID string
	err = db.GetDB().QueryRow("SELECT status, gcal_event_id FROM bookings WHERE id = $1", bookingID).Scan(&status, &gcalID)
	if err != nil {
		fmt.Printf("   ❌ Error leyendo DB: %v\n", err)
	} else {
		fmt.Printf("   Estado final DB: %s\n", status)
		fmt.Printf("   ID GCal en DB: %s\n", gcalID)
	}
	fmt.Println("\n✅ Test de cancelación completado")
}
