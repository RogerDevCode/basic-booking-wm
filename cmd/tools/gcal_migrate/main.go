package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "github.com/lib/pq"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

const (
	correctCalendarID = "4864be701779548592e0962cf7b4478bb145e26b436ab6fb9285a957892b661f@group.calendar.google.com"
	providerID        = "00000000-0000-0000-0000-000000000001"
)

func main() {
	// Load credentials
	localPath := os.Getenv("DEV_LOCAL_GCAL_KEY_PATH")
	if len(localPath) > 0 && localPath[0] == '~' {
		homeDir, _ := os.UserHomeDir()
		localPath = filepath.Join(homeDir, localPath[1:])
	}
	credsJSON, err := os.ReadFile(localPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to read credentials: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()
	svc, err := calendar.NewService(ctx, option.WithCredentialsJSON(credsJSON))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create GCal service: %v\n", err)
		os.Exit(1)
	}

	// Connect to DB
	dbURL := os.Getenv("DATABASE_URL")
	dbConn, err := sql.Open("postgres", dbURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to connect to DB: %v\n", err)
		os.Exit(1)
	}
	defer dbConn.Close()
	if err := dbConn.Ping(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to ping DB: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Println("║  MIGRAR EVENTOS: primary → Booking Titanium             ║")
	fmt.Println("╚══════════════════════════════════════════════════════════╝")

	// STEP 0: Update provider gcal_calendar_id
	fmt.Println("\n── PASO 0: Actualizar provider.gcal_calendar_id ──")
	_, err = dbConn.ExecContext(ctx,
		"UPDATE providers SET gcal_calendar_id = $1 WHERE id = $2",
		correctCalendarID, providerID)
	if err != nil {
		fmt.Printf("❌ Failed to update provider: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("✅ Provider actualizado: gcal_calendar_id = %s\n", correctCalendarID[:30]+"...")

	// STEP 1: Get all March 31 bookings from DB
	fmt.Println("\n── PASO 1: Obtener bookings del 31 marzo ──")
	rows, err := dbConn.QueryContext(ctx, `
		SELECT id, start_time, end_time, gcal_event_id, status
		FROM bookings
		WHERE start_time >= '2026-03-31' AND start_time < '2026-04-01'
		ORDER BY start_time`)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to query bookings: %v\n", err)
		os.Exit(1)
	}

	type bookingRow struct {
		ID          string
		StartTime   time.Time
		EndTime     time.Time
		GCalEventID *string
		Status      string
	}

	var bookings []bookingRow
	for rows.Next() {
		var b bookingRow
		if err := rows.Scan(&b.ID, &b.StartTime, &b.EndTime, &b.GCalEventID, &b.Status); err != nil {
			fmt.Printf("❌ Scan error: %v\n", err)
			continue
		}
		bookings = append(bookings, b)
	}
	rows.Close()
	fmt.Printf("   Encontrados: %d bookings\n", len(bookings))

	// STEP 2: For each booking, delete from primary + create on Booking Titanium
	fmt.Println("\n── PASO 2: Migrar eventos ──")
	migrated := 0
	failed := 0

	for _, b := range bookings {
		fmt.Printf("\n   📅 %s (ID: %s)\n", b.StartTime.Format("15:04 UTC"), b.ID[:8])

		// Delete old event from primary
		if b.GCalEventID != nil && *b.GCalEventID != "" {
			fmt.Printf("      🗑️  Borrando de primary... ")
			err := svc.Events.Delete("primary", *b.GCalEventID).Do()
			if err != nil {
				fmt.Printf("⚠️ %v\n", err)
			} else {
				fmt.Printf("✅\n")
			}
		}

		// Create new event on Booking Titanium calendar
		fmt.Printf("      📅 Creando en Booking Titanium... ")
		event := &calendar.Event{
			Summary:     fmt.Sprintf("Reserva Médica — %s", b.StartTime.In(time.FixedZone("ART", -3*3600)).Format("15:04")),
			Description: fmt.Sprintf("Booking ID: %s\nProveedor: %s\nStatus: %s", b.ID, providerID, b.Status),
			Start: &calendar.EventDateTime{
				DateTime: b.StartTime.Format(time.RFC3339),
				TimeZone: "America/Argentina/Buenos_Aires",
			},
			End: &calendar.EventDateTime{
				DateTime: b.EndTime.Format(time.RFC3339),
				TimeZone: "America/Argentina/Buenos_Aires",
			},
		}

		created, err := svc.Events.Insert(correctCalendarID, event).Do()
		if err != nil {
			fmt.Printf("❌ %v\n", err)
			failed++
			continue
		}
		fmt.Printf("✅ %s\n", created.Id)

		// Update DB with new event ID
		fmt.Printf("      💾 Actualizando DB... ")
		_, err = dbConn.ExecContext(ctx,
			"UPDATE bookings SET gcal_event_id = $1, gcal_synced_at = NOW(), updated_at = NOW() WHERE id = $2",
			created.Id, b.ID)
		if err != nil {
			fmt.Printf("❌ %v\n", err)
			failed++
			continue
		}
		fmt.Printf("✅\n")
		fmt.Printf("      🔗 SYNC: DB=%s ↔ GCal=%s (Booking Titanium)\n", b.ID[:8], created.Id)
		migrated++

		time.Sleep(300 * time.Millisecond)
	}

	// STEP 3: Verify
	fmt.Println("\n── PASO 3: Verificación final ──")
	fmt.Printf("\n   📅 Eventos en Booking Titanium (March 31):\n")
	events, err := svc.Events.List(correctCalendarID).
		TimeMin("2026-03-31T00:00:00Z").
		TimeMax("2026-04-01T00:00:00Z").
		SingleEvents(true).
		OrderBy("startTime").
		Do()
	if err != nil {
		fmt.Printf("   ❌ Error: %v\n", err)
	} else {
		for _, ev := range events.Items {
			startT, _ := time.Parse(time.RFC3339, ev.Start.DateTime)
			fmt.Printf("   ✅ %s | %s | ID: %s\n", startT.Format("15:04 UTC"), ev.Summary, ev.Id)
		}
		fmt.Printf("   Total en Booking Titanium: %d eventos\n", len(events.Items))
	}

	// Check primary is empty
	fmt.Printf("\n   📅 Eventos en primary (March 31 — should be empty):\n")
	pEvents, err := svc.Events.List("primary").
		TimeMin("2026-03-31T00:00:00Z").
		TimeMax("2026-04-01T00:00:00Z").
		SingleEvents(true).
		Do()
	if err != nil {
		fmt.Printf("   ❌ Error: %v\n", err)
	} else {
		if len(pEvents.Items) == 0 {
			fmt.Println("   ✅ primary vacío (correcto)")
		} else {
			fmt.Printf("   ⚠️ Aún hay %d eventos en primary\n", len(pEvents.Items))
		}
	}

	// Summary
	fmt.Println()
	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Printf("║  MIGRACIÓN: %d migrados | %d fallidos                    ║\n", migrated, failed)
	fmt.Println("╚══════════════════════════════════════════════════════════╝")
}
