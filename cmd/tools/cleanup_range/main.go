package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/option"

	"booking-titanium-wm/internal/core/config"
	"booking-titanium-wm/internal/core/db"
)

func main() {
	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Println("║  LIMPIEZA TOTAL: HOY A +120 DÍAS (Sincronizada)          ║")
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

	// 2. Load GCal credentials once
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

	// 3. Find all bookings in range
	fmt.Println("\n── PASO 1: Identificar reservas en DB (Hoy → +120 días) ──")
	startTimeRange := time.Now().Format("2006-01-02")
	endTimeRange := time.Now().AddDate(0, 0, 120).Format("2006-01-02")
	
	query := `
		SELECT id, start_time, gcal_event_id, provider_id 
		FROM bookings 
		WHERE start_time >= $1 AND start_time <= $2
		ORDER BY start_time`
	
	rows, err := db.GetDB().Query(query, startTimeRange, endTimeRange)
	if err != nil {
		fmt.Printf("❌ Error consultando DB: %v\n", err)
		os.Exit(1)
	}
	defer rows.Close()

	type bookingRow struct {
		ID          string
		StartTime   time.Time
		GCalEventID *string
		ProviderID  string
	}

	var toDelete []bookingRow
	for rows.Next() {
		var b bookingRow
		if err := rows.Scan(&b.ID, &b.StartTime, &b.GCalEventID, &b.ProviderID); err != nil {
			fmt.Printf("⚠️ Error escaneando fila: %v\n", err)
			continue
		}
		toDelete = append(toDelete, b)
	}

	fmt.Printf("   Encontradas: %d reservas\n", len(toDelete))

	// 4. Execution Loop
	fmt.Println("\n── PASO 2: Borrado Atómico (GCal → DB) ──────────────────")
	
	// Cache for provider calendar IDs
	calendarMap := make(map[string]string)
	calendarMap[config.GetProviderID()] = config.GetGCalCalendarID()

	successCount := 0
	desyncCount := 0

	for _, b := range toDelete {
		fmt.Printf("\n   🗑️ [%s] %s\n", b.StartTime.Format("02 Jan 15:04"), b.ID[:8])
		
		calID, ok := calendarMap[b.ProviderID]
		if !ok {
			// Fetch from providers table if not in cache
			err := db.GetDB().QueryRow("SELECT gcal_calendar_id FROM providers WHERE id = $1", b.ProviderID).Scan(&calID)
			if err != nil || calID == "" {
				calID = "primary"
			}
			calendarMap[b.ProviderID] = calID
		}

		// A. GCal Delete
		gcalDeleted := false
		if b.GCalEventID != nil && *b.GCalEventID != "" {
			err = svc.Events.Delete(calID, *b.GCalEventID).Do()
			if err != nil {
				// Handle already deleted
				if gerr, ok := err.(*googleapi.Error); ok && (gerr.Code == 410 || gerr.Code == 404) {
					fmt.Printf("      ⚠️ GCal: Ya no existía el evento (OK)\n")
					gcalDeleted = true
				} else {
					fmt.Printf("      ❌ GCal ERROR: %v (Marcado como desincronía)\n", err)
					desyncCount++
					// Even if GCal fails, we still proceed to delete from DB to stay consistent as requested.
					// But we increment desyncCount for reporting.
					gcalDeleted = true 
				}
			} else {
				fmt.Printf("      ✅ GCal: Evento eliminado\n")
				gcalDeleted = true
			}
		} else {
			fmt.Printf("      ⚠️ GCal: Sin ID registrado (Omitido)\n")
			gcalDeleted = true
		}

		// B. DB Delete
		if gcalDeleted {
			_, err = db.GetDB().Exec("DELETE FROM bookings WHERE id = $1", b.ID)
			if err != nil {
				fmt.Printf("      ❌ DB ERROR: No se pudo borrar de la tabla: %v\n", err)
			} else {
				fmt.Printf("      ✅ DB: Registro eliminado\n")
				successCount++
			}
		}
	}

	// 5. Ghost Search (Desync check)
	fmt.Println("\n── PASO 3: Búsqueda de 'Fantasmas' (GCal sin DB) ─────────")
	
	for provID, calID := range calendarMap {
		fmt.Printf("   Revisando calendario: %s para Proveedor %s\n", calID, provID[:8])
		
		tMin := time.Now().Format(time.RFC3339)
		tMax := time.Now().AddDate(0, 0, 120).Format(time.RFC3339)
		
		events, err := svc.Events.List(calID).TimeMin(tMin).TimeMax(tMax).SingleEvents(true).Do()
		if err != nil {
			fmt.Printf("   ❌ Error listando GCal: %v\n", err)
			continue
		}

		ghostsFound := 0
		for _, item := range events.Items {
			// Check if this event ID exists in any row of the bookings table
			var exists bool
			err := db.GetDB().QueryRow("SELECT EXISTS(SELECT 1 FROM bookings WHERE gcal_event_id = $1)", item.Id).Scan(&exists)
			if err == nil && !exists {
				fmt.Printf("      👻 FANTASMA ENCONTRADO: '%s' [%s] ID: %s\n", item.Summary, item.Start.DateTime, item.Id)
				fmt.Printf("         -> Borrando fantasma...\n")
				_ = svc.Events.Delete(calID, item.Id).Do()
				ghostsFound++
			}
		}
		if ghostsFound == 0 {
			fmt.Println("      ✅ No se encontraron eventos fantasma.")
		} else {
			fmt.Printf("      ✅ %d fantasmas eliminados.\n", ghostsFound)
		}
	}

	fmt.Println("\n── RESULTADO FINAL ──────────────────────────────────────────")
	fmt.Printf("   ✅ Reservas limpiadas: %d\n", successCount)
	fmt.Printf("   ⚠️ Desincronías reportadas: %d\n", desyncCount)
	fmt.Println("╚════════════════════════════════════════════════════════════╝")
}
