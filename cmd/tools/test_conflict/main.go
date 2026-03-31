package main

import (
	"fmt"
	"os"

	"booking-titanium-wm/internal/core/config"
	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/internal/orchestrator"
)

func main() {
	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Println("║  TEST DE CONFLICTO: Intentar reservar slot ocupado       ║")
	fmt.Println("╚══════════════════════════════════════════════════════════╝")

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

	// 2. Prepare request for a known booked slot
	// From the seed output: Slot 12:00 local (15:00 UTC) on 2026-03-31 is booked
	req := orchestrator.BookingOrchestratorRequest{
		StartTime: "2026-03-31T15:00:00Z", // 12:00 in UTC-3
		ChatID:    "1234567890",             // Different user to avoid idempotency returning success
		UserName:  "Test Conflicto",
		UserEmail: "conflicto@test.com",
	}

	fmt.Printf("\nIntentando reservar:\n")
	fmt.Printf("  ▶️  Fecha/Hora: %s\n", req.StartTime)
	fmt.Printf("  ▶️  Usuario: %s\n", req.UserName)
	fmt.Println("\nEjecutando BookingOrchestrator...")

	// 3. Execute
	resp := orchestrator.BookingOrchestrator(req)

	// 4. Check result
	fmt.Println("\n── RESULTADO ───────────────────────────────────────────────")
	if resp.Success {
		fmt.Println("⚠️  Fallo TDD: ¡La reserva fue PERMITIDA en un slot ocupado!")
		fmt.Printf("   Datos: %+v\n", resp.Data)
		os.Exit(1)
	} else {
		fmt.Println("✅ ÉXITO TDD: La reserva fue RECHAZADA como se esperaba.")
		fmt.Printf("   Error Code: %s\n", *resp.ErrorCode)
		fmt.Printf("   Mensaje:    %s\n", *resp.ErrorMessage)
	}
}
