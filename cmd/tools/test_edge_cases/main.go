package main

import (
	"context"
	"fmt"
	"os"

	"booking-titanium-wm/internal/booking"
	"booking-titanium-wm/internal/core/config"
	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/internal/orchestrator"
)

func main() {
	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Println("║  TESTS DE BORDE E INGENIOSOS PARA EL 31 DE MARZO         ║")
	fmt.Println("╚══════════════════════════════════════════════════════════╝")

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

	// === TEST 1: Reserva superpuesta parcial (Overlap Test) ===
	// Tenemos reserva válida confirmada a las 09:00 local (12:00 UTC) hasta las 10:00 local (13:00 UTC).
	// Intentaremos reservar a las 09:30 local (12:30 UTC). Debería fallar.
	fmt.Println("\n── TEST 1: Reserva Superpuesta (Partial Overlap) ───────────")
	reqConflict := orchestrator.BookingOrchestratorRequest{
		StartTime: "2026-03-31T12:30:00Z", // 09:30 local
		ChatID:    "9999991",
		UserName:  "Test Overlap",
	}
	fmt.Printf("   Intentando reservar a las 09:30 local (en medio de la reserva de las 09:00)\n")
	respConflict := orchestrator.BookingOrchestrator(reqConflict)
	if !respConflict.Success {
		fmt.Printf("   ✅ ÉXITO TDD: Rechazado correctamente (Code: %s, Mensaje: %s)\n", *respConflict.ErrorCode, *respConflict.ErrorMessage)
	} else {
		fmt.Println("   ❌ FALLO TDD: ¡Permitió una reserva superpuesta!")
	}

	// === TEST 2: Doble Cancelación ===
	// La reserva de las 10:00 (13:00 UTC) ya fue cancelada en el test anterior. (ID: 00e311c8-fd5b-4739-8cc6-806a7ae5e187)
	fmt.Println("\n── TEST 2: Doble Cancelación ───────────────────────────────")
	bookingIDCancelado := "00e311c8-fd5b-4739-8cc6-806a7ae5e187"
	fmt.Printf("   Intentando cancelar nuevamente la reserva ya cancelada de las 10:00\n")
	respCancel := booking.CancelBooking(bookingIDCancelado, "Intento de doble cancelación")
	if !respCancel.Success {
		fmt.Printf("   ✅ ÉXITO TDD: Rechazado correctamente (Code: %s, Mensaje: %s)\n", *respCancel.ErrorCode, *respCancel.ErrorMessage)
	} else {
		fmt.Println("   ❌ FALLO TDD: ¡Permitió cancelar dos veces la misma reserva!")
	}

	// === TEST 3: Agendar fuera de horario laboral ===
	// Intentaremos reservar a las 03:00 AM local (06:00 UTC) del 31 de marzo.
	// Asumiendo que el proveedor no trabaja a las 03:00 AM.
	fmt.Println("\n── TEST 3: Reserva fuera de horario laboral ────────────────")
	reqOutHours := orchestrator.BookingOrchestratorRequest{
		StartTime: "2026-03-31T06:00:00Z", // 03:00 local
		ChatID:    "9999993",
		UserName:  "Test Insomnio",
	}
	fmt.Printf("   Intentando reservar a las 03:00 AM local\n")
	
	// Check DB if slots for 03:00 exist. The availability engine will say NO_AVAILABILITY
	respOut := orchestrator.BookingOrchestrator(reqOutHours)
	if !respOut.Success {
		fmt.Printf("   ✅ ÉXITO TDD: Rechazado correctamente (Code: %s, Mensaje: %s)\n", *respOut.ErrorCode, *respOut.ErrorMessage)
	} else {
		// Rollback if it allowed it
		_ = context.Background() // satisfy unused
		var gcalID string
		if respOut.Data != nil {
			if eventID, ok := (*respOut.Data)["gcal_event_id"].(string); ok {
				gcalID = eventID
			}
		}
		fmt.Printf("   ❌ FALLO TDD: ¡Permitió la reserva de madrugada! GCal Event: %s\n", gcalID)
	}

	fmt.Println("\n✅ Batería de Tests Ingeniosos Finalizada")
}
