package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"

	"booking-titanium-wm/internal/core/config"
	"booking-titanium-wm/internal/core/db"
)

func main() {
	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Println("║  LIMPIEZA HISTÓRICA: -120 DÍAS A HOY (GCal Ghosts)       ║")
	fmt.Println("╚══════════════════════════════════════════════════════════╝")

	// 1. Setup
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

	// 2. Load GCal credentials
	localPath := os.Getenv("DEV_LOCAL_GCAL_KEY_PATH")
	if len(localPath) > 0 && localPath[0] == '~' {
		homeDir, _ := os.UserHomeDir()
		localPath = filepath.Join(homeDir, localPath[1:])
	}
	credsJSON, err := os.ReadFile(localPath)
	if err != nil {
		fmt.Printf("❌ No se pudo leer la llave de GCal: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()
	svc, err := calendar.NewService(ctx, option.WithCredentialsJSON(credsJSON))
	if err != nil {
		fmt.Printf("❌ No se pudo crear el servicio GCal: %v\n", err)
		os.Exit(1)
	}

	calendarID := config.GetGCalCalendarID()
	fmt.Printf("\n── PASO 1: Escaneando calendario '%s' ──\n", calendarID[:30]+"...")
	
	tMin := time.Now().AddDate(0, 0, -120).Format(time.RFC3339)
	tMax := time.Now().Format(time.RFC3339)

	events, err := svc.Events.List(calendarID).TimeMin(tMin).TimeMax(tMax).SingleEvents(true).Do()
	if err != nil {
		fmt.Printf("❌ Error al listar eventos de GCal: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("   Encontrados: %d eventos totales en el periodo.\n", len(events.Items))

	// 3. Identification and Deletion
	fmt.Println("\n── PASO 2: Identificación y Eliminación ──────────────────")
	
	targets := []string{
		"reserva médica",
		"reserva medica",
		"(no title)",
		"(sin título)",
		"(sin titulo)",
		"reserva",
		"sin título",
		"no title",
		"",
	}

	cleanedCount := 0
	for _, item := range events.Items {
		title := strings.ToLower(item.Summary)
		isTarget := false

		// Identify based on title
		for _, target := range targets {
			if title == target || strings.Contains(title, target) {
				isTarget = true
				break
			}
		}

		// Also identify if summary is empty or only whitespace
		if strings.TrimSpace(item.Summary) == "" {
			isTarget = true
		}

		if isTarget {
			fmt.Printf("   🗑️ Borrando: '%s' [%s] ID: %s\n", item.Summary, item.Start.DateTime, item.Id)
			err := svc.Events.Delete(calendarID, item.Id).Do()
			if err != nil {
				fmt.Printf("      ❌ Error eliminando GCal: %v\n", err)
			} else {
				// Final check in DB too
				_, _ = db.GetDB().Exec("DELETE FROM bookings WHERE gcal_event_id = $1", item.Id)
				cleanedCount++
			}
		}
	}

	fmt.Println("\n── RESULTADO FINAL ──────────────────────────────────────────")
	fmt.Printf("   ✅ Eventos 'fantasma' (sin título o sistema) eliminados: %d\n", cleanedCount)
	fmt.Println("╚════════════════════════════════════════════════════════════╝")
}
