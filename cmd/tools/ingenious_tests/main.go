package main

import (
	"fmt"
	"os"
	"sync"

	"booking-titanium-wm/internal/booking"
	"booking-titanium-wm/internal/core/config"
	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/internal/orchestrator"
	"booking-titanium-wm/pkg/types"
)

func main() {
	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Println("║  BATERÍA DE TESTS INGENIOSOS - 31 DE MARZO               ║")
	fmt.Println("╚══════════════════════════════════════════════════════════╝")

	dbConfig := db.GetDefaultConfig()
	if err := db.InitDB(dbConfig); err != nil {
		fmt.Printf("❌ Fallo en conexión DB: %v\n", err)
		os.Exit(1)
	}
	defer db.CloseDB()

	if err := config.Init(); err != nil {
		fmt.Printf("❌ Fallo en config: %v\n", err)
		os.Exit(1)
	}

	// ---------------------------------------------------------
	// TEST 1: Violación de Buffer (10 minutos)
	// Hora ocupada: 09:00 local (12:00 UTC) - Slot ya sembrado.
	// Intentaremos reservar a las 09:05 local (12:05 UTC).
	// ---------------------------------------------------------
	fmt.Println("\n── TEST 1: Violación de Buffer (Slot 09:05 vs ocupado 09:00)")
	reqBuffer := orchestrator.BookingOrchestratorRequest{
		StartTime: "2026-03-31T12:05:00Z", // Dentro del rango de la reserva de las 09:00
		ChatID:    "TEST_BUFFER",
		UserName:  "Test Buffer",
	}
	respBuffer := orchestrator.BookingOrchestrator(reqBuffer)
	if !respBuffer.Success {
		fmt.Printf("   ✅ ÉXITO: Rechazado (Code: %s, Msg: %s)\n", *respBuffer.ErrorCode, *respBuffer.ErrorMessage)
	} else {
		fmt.Println("   ❌ ERROR: ¡Permitió la reserva en medio de otra!")
	}

	// ---------------------------------------------------------
	// TEST 2: Simulación de Concurrencia (Carrera Crítica)
	// Intentamos reservar el mismo slot libre (ej: 08:00 local / 11:00 UTC) 
	// con dos hilos simultáneos.
	// ---------------------------------------------------------
	fmt.Println("\n── TEST 2: Carrera Crítica (Simultaneidad para 08:00 local)")
	reqRace := orchestrator.BookingOrchestratorRequest{
		StartTime: "2026-03-31T11:00:00Z", // 08:00 local
		ChatID:    "RACE_USER_",
		UserName:  "Race Participant",
	}

	var wg sync.WaitGroup
	results := make([]types.StandardContractResponse[map[string]any], 2)

	wg.Add(2)
	for i := 0; i < 2; i++ {
		go func(idx int) {
			defer wg.Done()
			r := reqRace
			r.ChatID = fmt.Sprintf("RACE_USER_%d", idx)
			results[idx] = orchestrator.BookingOrchestrator(r)
		}(i)
	}
	wg.Wait()

	successCount := 0
	for _, res := range results {
		if res.Success {
			successCount++
		}
	}

	if successCount == 1 {
		fmt.Println("   ✅ ÉXITO: Solo una reserva tuvo éxito. El lock distribuido funcionó correctamente.")
	} else if successCount > 1 {
		fmt.Println("   ❌ ERROR CRÍTICO: ¡Doble reserva para el mismo slot (Overbooking)! Ambos tuvieron éxito.")
	} else {
		fmt.Printf("   ⚠️ AVISO: Ninguno tuvo éxito? (Probablemente el segundo fue bloqueado por el lock del primero y el primero falló por otra razón)\n")
	}

	// ---------------------------------------------------------
	// TEST 3: Doble Cancelación
	// ---------------------------------------------------------
	fmt.Println("\n── TEST 3: Doble Cancelacion (Reserva de las 10:00 ya cancelada)")
	alreadyCancelledID := "00e311c8-fd5b-4739-8cc6-806a7ae5e187"
	respDouble := booking.CancelBooking(alreadyCancelledID, "Intento duplicado")
	if !respDouble.Success {
		fmt.Printf("   ✅ ÉXITO: Rechazado correctamente por estar ya cancelada (Code: %s)\n", *respDouble.ErrorCode)
	} else {
		fmt.Println("   ❌ ERROR: ¡Permitió cancelar dos veces!")
	}

	// ---------------------------------------------------------
	// TEST 4: Formato de Fecha Inválido
	// ---------------------------------------------------------
	fmt.Println("\n── TEST 4: Validación de Formato Malformado")
	reqInvalid := orchestrator.BookingOrchestratorRequest{
		StartTime: "HOY_A_LAS_TRES", 
		ChatID:    "TEST_INVALID",
		UserName:  "Test Invalid",
	}
	respInvalid := orchestrator.BookingOrchestrator(reqInvalid)
	if !respInvalid.Success {
		fmt.Printf("   ✅ ÉXITO: Rechazado por validación (Code: %s)\n", *respInvalid.ErrorCode)
	} else {
		fmt.Println("   ❌ ERROR: ¡Permitió una fecha malformada!")
	}

	fmt.Println("\n✅ Batería Finalizada")
}
