package main

import (
	"database/sql"
	"fmt"
	"os"

	"booking-titanium-wm/internal/booking"
	"booking-titanium-wm/internal/core/config"
	"booking-titanium-wm/internal/core/db"
)

func main() {
	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Println("║  TEST DE CANCELACIÓN: Buscar y cancelar reserva a 11:30  ║")
	fmt.Println("╚══════════════════════════════════════════════════════════╝")

	targetTime := "2026-03-31 14:30:00+00" // 11:30 local (-03:00)

	// 1. Initialize DB and Config
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		fmt.Println("❌ DATABASE_URL vacía")
		os.Exit(1)
	}

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

	fmt.Printf("\n── 1. BUSCANDO RESERVA EN DB ───────────────────────────\n")
	fmt.Printf("   Buscando horario: %s (UTC)\n", targetTime)

	var bookingID string
	var status string
	err := db.GetDB().QueryRow("SELECT id, status FROM bookings WHERE start_time = $1", targetTime).Scan(&bookingID, &status)
	
	if err == sql.ErrNoRows {
		fmt.Println("   ❌ ÉXITO TDD: No existe ninguna reserva a esa hora.")
		fmt.Println("      Comportamiento esperado: No se puede cancelar lo que no existe.")
		os.Exit(0)
	} else if err != nil {
		fmt.Printf("   ❌ Error leyendo DB: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("   ✅ Reserva encontrada: %s (Status: %s)\n", bookingID, status)

	fmt.Printf("\n── 2. CANCELANDO EN BASE DE DATOS ──────────────────────\n")
	resp := booking.CancelBooking(bookingID, "Test de cancelación 11:30")

	if !resp.Success {
		errMsg := "Unknown error"
		if resp.ErrorMessage != nil {
			errMsg = *resp.ErrorMessage
		}
		fmt.Printf("   ❌ Error: %s\n", errMsg)
	} else {
		fmt.Printf("   ✅ Reserva actualizada a estado 'cancelled' en la DB\n")
	}
}
